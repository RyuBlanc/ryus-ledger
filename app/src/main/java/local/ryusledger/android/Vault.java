package local.ryusledger.android;

import android.util.AtomicFile;
import android.util.Base64;

import org.bouncycastle.crypto.generators.SCrypt;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Android port of the Ryu's Ledger encrypted vault.
 *
 * The vault stores each account as an encrypted local file.
 * Quick unlock does not replace the existing password or recovery wrappers.
 * It only allows Android Keystore to protect a temporary copy of the same
 * 32-byte Ledger master key.
 */
final class Vault {

 private final File dir;

 private JSONObject session;
 private byte[] master;

 private final Map<String, Integer> attempts = new HashMap<>();
 private final Map<String, Long> until = new HashMap<>();

 private int globalCount;
 private long globalUntil;

 private static final SecureRandom RNG = new SecureRandom();

 Vault(File dir) {
  this.dir = dir;

  if (!dir.exists() && !dir.mkdirs()) {
   throw new IllegalStateException(
           "Cannot create private storage."
   );
  }
 }

 static byte[] bytes(String value) {
  return value.getBytes(StandardCharsets.UTF_8);
 }

 static String text(byte[] value) {
  return new String(value, StandardCharsets.UTF_8);
 }

 static String uuid() {
  return UUID.randomUUID().toString();
 }

 static byte[] random(int length) {
  byte[] value = new byte[length];
  RNG.nextBytes(value);
  return value;
 }

 static String hex(byte[] value) {
  StringBuilder output = new StringBuilder();

  for (byte item : value) {
   output.append(
           String.format(
                   Locale.ROOT,
                   "%02x",
                   item & 255
           )
   );
  }

  return output.toString();
 }

 static byte[] unhex(
         String value,
         int expectedLength
 ) throws Exception {

  if (!value.matches(
          "[a-f0-9]{" + (expectedLength * 2) + "}"
  )) {
   throw new Exception(
           "Invalid encrypted metadata."
   );
  }

  byte[] output = new byte[expectedLength];

  for (int index = 0; index < expectedLength; index++) {
   output[index] = (byte) Integer.parseInt(
           value.substring(
                   index * 2,
                   index * 2 + 2
           ),
           16
   );
  }

  return output;
 }

 static String email(String value) throws Exception {
  if (value == null) {
   throw new Exception(
           "Enter a valid email-shaped local login label."
   );
  }

  String normalized = value
          .trim()
          .toLowerCase(Locale.ROOT);

  if (value.length() > 254
          || !normalized.matches(
          "[^\\s@]+@[^\\s@]+\\.[^\\s@]+"
  )) {
   throw new Exception(
           "Enter a valid email-shaped local login label."
   );
  }

  return normalized;
 }

 static String password(String value) throws Exception {
  if (value == null
          || value.length() < 14
          || value.length() > 256) {
   throw new Exception(
           "Use a passphrase of 14–256 characters."
   );
  }

  return value;
 }

 static String recovery(String value) throws Exception {
  if (value == null) {
   throw new Exception(
           "Enter the complete 64-character recovery key."
   );
  }

  String normalized = value
          .replaceAll("[\\s-]", "")
          .toLowerCase(Locale.ROOT);

  if (!normalized.matches("[a-f0-9]{64}")) {
   throw new Exception(
           "Enter the complete 64-character recovery key."
   );
  }

  return normalized;
 }

 static String newRecovery() {
  return hex(random(32))
          .replaceAll(
                  "(.{8})(?!$)",
                  "$1-"
          );
 }

 static JSONObject seal(
         byte[] key,
         byte[] data,
         String aad
 ) throws Exception {

  byte[] iv = random(12);

  Cipher cipher = Cipher.getInstance(
          "AES/GCM/NoPadding"
  );

  cipher.init(
          Cipher.ENCRYPT_MODE,
          new SecretKeySpec(key, "AES"),
          new GCMParameterSpec(128, iv)
  );

  cipher.updateAAD(bytes(aad));

  byte[] output = cipher.doFinal(data);

  byte[] encryptedData = Arrays.copyOf(
          output,
          output.length - 16
  );

  byte[] tag = Arrays.copyOfRange(
          output,
          output.length - 16,
          output.length
  );

  return new JSONObject()
          .put("iv", hex(iv))
          .put("tag", hex(tag))
          .put(
                  "data",
                  Base64.encodeToString(
                          encryptedData,
                          Base64.NO_WRAP
                  )
          );
 }

 static byte[] open(
         byte[] key,
         JSONObject box,
         String aad
 ) throws Exception {

  String rawData = box.getString("data");

  if (rawData.length() > 24_000_000) {
   throw new Exception(
           "Encrypted file too large."
   );
  }

  byte[] encryptedData = Base64.decode(
          rawData,
          Base64.NO_WRAP
  );

  byte[] tag = unhex(
          box.getString("tag"),
          16
  );

  byte[] encryptedWithTag = Arrays.copyOf(
          encryptedData,
          encryptedData.length + 16
  );

  System.arraycopy(
          tag,
          0,
          encryptedWithTag,
          encryptedData.length,
          16
  );

  Cipher cipher = Cipher.getInstance(
          "AES/GCM/NoPadding"
  );

  cipher.init(
          Cipher.DECRYPT_MODE,
          new SecretKeySpec(key, "AES"),
          new GCMParameterSpec(
                  128,
                  unhex(
                          box.getString("iv"),
                          12
                  )
          )
  );

  cipher.updateAAD(bytes(aad));

  return cipher.doFinal(encryptedWithTag);
 }

 static JSONObject wrap(
         String secret,
         byte[] masterKey,
         String aad
 ) throws Exception {

  byte[] salt = random(16);

  byte[] derivedKey = SCrypt.generate(
          bytes(secret),
          salt,
          32768,
          8,
          1,
          32
  );

  try {
   return new JSONObject()
           .put("salt", hex(salt))
           .put(
                   "box",
                   seal(
                           derivedKey,
                           masterKey,
                           aad
                   )
           );
  } finally {
   Arrays.fill(derivedKey, (byte) 0);
  }
 }

 static byte[] unwrap(
         String secret,
         JSONObject wrapper,
         String aad
 ) throws Exception {

  byte[] derivedKey = SCrypt.generate(
          bytes(secret),
          unhex(
                  wrapper.getString("salt"),
                  16
          ),
          32768,
          8,
          1,
          32
  );

  try {
   byte[] masterKey = open(
           derivedKey,
           wrapper.getJSONObject("box"),
           aad
   );

   if (masterKey.length != 32) {
    Arrays.fill(masterKey, (byte) 0);

    throw new Exception(
            "Invalid master key."
    );
   }

   return masterKey;

  } finally {
   Arrays.fill(derivedKey, (byte) 0);
  }
 }

 private File file(String accountEmail) throws Exception {
  byte[] digest = MessageDigest
          .getInstance("SHA-256")
          .digest(bytes(accountEmail));

  return new File(
          dir,
          hex(digest) + ".vault.json"
  );
 }

 private JSONObject read(String accountEmail) throws Exception {
  AtomicFile atomicFile = new AtomicFile(
          file(accountEmail)
  );

  try (InputStream input = atomicFile.openRead()) {
   byte[] raw = readLimited(
           input,
           25_000_000
   );

   return check(
           new JSONObject(text(raw)),
           accountEmail
   );
  }
 }

 static byte[] readLimited(
         InputStream input,
         int limit
 ) throws Exception {

  ByteArrayOutputStream output =
          new ByteArrayOutputStream();

  byte[] buffer = new byte[8192];
  int count;

  while ((count = input.read(buffer)) != -1) {
   if (output.size() + count > limit) {
    throw new Exception(
            "File exceeds size limit."
    );
   }

   output.write(
           buffer,
           0,
           count
   );
  }

  return output.toByteArray();
 }

 static JSONObject check(
         JSONObject vault,
         String accountEmail
 ) throws Exception {

  if (!"ryu-encrypted-vault-v1".equals(
          vault.getString("schema")
  )
          || !accountEmail.equals(
          vault.getString("email")
  )
          || vault.getString("name").length() > 80) {
   throw new Exception(
           "Invalid account backup."
   );
  }

  UUID.fromString(vault.getString("id"));
  UUID.fromString(vault.getString("revision"));

  for (String field : new String[]{
          "password",
          "recovery"
  }) {
   JSONObject wrapper =
           vault.getJSONObject(field);

   unhex(
           wrapper.getString("salt"),
           16
   );

   checkBox(
           wrapper.getJSONObject("box")
   );
  }

  checkBox(vault.getJSONObject("ledger"));

  return vault;
 }

 static void checkBox(JSONObject box) throws Exception {
  unhex(box.getString("iv"), 12);
  unhex(box.getString("tag"), 16);

  if (box.getString("data").length() > 24_000_000) {
   throw new Exception(
           "Invalid encrypted file."
   );
  }

  Base64.decode(
          box.getString("data"),
          Base64.NO_WRAP
  );
 }

 private void write(
         JSONObject vault,
         boolean exclusive
 ) throws Exception {

  File destination = file(
          vault.getString("email")
  );

  if (exclusive
          && (destination.exists()
          || new File(
          destination + ".bak"
  ).exists())) {
   throw new Exception(
           "This local account already exists."
   );
  }

  AtomicFile atomicFile = new AtomicFile(
          destination
  );

  FileOutputStream output = null;

  try {
   output = atomicFile.startWrite();
   output.write(bytes(vault.toString()));
   atomicFile.finishWrite(output);

  } catch (Exception error) {
   if (output != null) {
    atomicFile.failWrite(output);
   }

   throw error;
  }
 }

 private void require() throws Exception {
  if (session == null || master == null) {
   throw new Exception(
           "Sign in first."
   );
  }
 }

 synchronized void lock() {
  if (master != null) {
   Arrays.fill(master, (byte) 0);
  }

  master = null;
  session = null;
 }

 private void throttle(String accountEmail) throws Exception {
  long wait = Math.max(
          until.getOrDefault(
                  accountEmail,
                  0L
          ),
          globalUntil
  ) - System.currentTimeMillis();

  if (wait > 0) {
   throw new Exception(
           "Too many attempts. Wait "
                   + ((wait + 999) / 1000)
                   + " seconds."
   );
  }
 }

 private void failed(String accountEmail) {
  int count = attempts.getOrDefault(
          accountEmail,
          0
  ) + 1;

  attempts.put(accountEmail, count);

  if (count >= 5) {
   until.put(
           accountEmail,
           System.currentTimeMillis()
                   + Math.min(
                   300_000L,
                   30_000L
                           * (1L << Math.min(
                           4,
                           count - 5
                   ))
           )
   );
  }

  globalCount++;

  if (globalCount >= 10) {
   globalUntil =
           System.currentTimeMillis() + 60_000L;
  }
 }

 private void success(String accountEmail) {
  attempts.remove(accountEmail);
  until.remove(accountEmail);

  globalCount = 0;
  globalUntil = 0;
 }

 static JSONObject ledger(JSONObject data) throws Exception {
  /*
   * Full accounting validation remains in bundled app.js.
   * Native validation protects the main size and collection limits.
   */
  if (bytes(data.toString()).length > 10_000_000
          || data.getJSONArray("records").length() > 20_000
          || data.getJSONArray("goals").length() > 1_000
          || data.getJSONArray("budgets").length() > 5_000) {
   throw new Exception(
           "Ledger exceeds supported limits."
   );
  }

  return data;
 }

 private JSONObject data(
         JSONObject vault,
         byte[] key
 ) throws Exception {

  byte[] ledgerBytes = open(
          key,
          vault.getJSONObject("ledger"),
          vault.getString("id") + ":ledger"
  );

  try {
   return ledger(
           new JSONObject(text(ledgerBytes))
   );
  } finally {
   Arrays.fill(ledgerBytes, (byte) 0);
  }
 }

 private JSONObject result() throws Exception {
  require();

  return new JSONObject()
          .put(
                  "name",
                  session.getString("name")
          )
          .put(
                  "email",
                  session.getString("email")
          )
          .put(
                  "revision",
                  session.getString("revision")
          )
          .put(
                  "data",
                  data(session, master)
          );
 }

 synchronized JSONObject register(
         JSONObject request
 ) throws Exception {

  if (session != null) {
   throw new Exception(
           "Sign out first."
   );
  }

  String accountEmail = email(
          request.getString("email")
  );

  String accountPassword = password(
          request.getString("password")
  );

  String accountName = request
          .getString("name")
          .trim();

  throttle(accountEmail);

  if (accountName.isEmpty()
          || accountName.length() > 80) {
   throw new Exception(
           "Enter a name up to 80 characters."
   );
  }

  byte[] newMaster = random(32);
  String recoveryKey = newRecovery();
  String accountId = uuid();

  JSONObject vault = new JSONObject()
          .put(
                  "schema",
                  "ryu-encrypted-vault-v1"
          )
          .put("id", accountId)
          .put("email", accountEmail)
          .put("name", accountName)
          .put("revision", uuid())
          .put(
                  "createdAt",
                  java.time.Instant.now().toString()
          );

  try {
   vault.put(
           "password",
           wrap(
                   accountPassword,
                   newMaster,
                   accountId + ":password"
           )
   );

   vault.put(
           "recovery",
           wrap(
                   recovery(recoveryKey),
                   newMaster,
                   accountId + ":recovery"
           )
   );

   vault.put(
           "ledger",
           seal(
                   newMaster,
                   bytes(
                           "{\"records\":[],\"goals\":[],\"budgets\":[]}"
                   ),
                   accountId + ":ledger"
           )
   );

   write(vault, true);

   session = vault;
   master = newMaster;

   return result().put(
           "recoveryKey",
           recoveryKey
   );

  } catch (Exception error) {
   Arrays.fill(newMaster, (byte) 0);
   lock();
   throw error;
  }
 }

 synchronized JSONObject login(
         JSONObject request
 ) throws Exception {

  if (session != null) {
   throw new Exception(
           "Sign out first."
   );
  }

  String accountEmail = email(
          request.getString("email")
  );

  throttle(accountEmail);

  String accountPassword =
          request.getString("password");

  if (accountPassword.length() > 256) {
   throw new Exception(
           "Invalid sign-in details."
   );
  }

  byte[] candidateMaster = null;

  try {
   JSONObject vault = read(accountEmail);

   candidateMaster = unwrap(
           accountPassword,
           vault.getJSONObject("password"),
           vault.getString("id") + ":password"
   );

   data(vault, candidateMaster);

   session = vault;
   master = candidateMaster;
   candidateMaster = null;

   success(accountEmail);

   return result();

  } catch (Exception error) {
   if (candidateMaster != null) {
    Arrays.fill(candidateMaster, (byte) 0);
   }

   lock();
   failed(accountEmail);

   throw new Exception(
           "Sign-in details are incorrect, or the account cannot be decrypted."
   );
  }
 }

 synchronized JSONObject save(
         JSONObject request
 ) throws Exception {

  require();

  JSONObject ledgerData = ledger(
          request.getJSONObject("data")
  );

  String revision =
          request.getString("revision");

  if (!revision.equals(
          session.getString("revision")
  )
          || !revision.equals(
          read(
                  session.getString("email")
          ).getString("revision")
  )) {
   throw new Exception(
           "Account changed. Sign out and sign in again."
   );
  }

  JSONObject updated = new JSONObject(
          session.toString()
  );

  updated.put("revision", uuid());

  updated.put(
          "ledger",
          seal(
                  master,
                  bytes(ledgerData.toString()),
                  updated.getString("id")
                          + ":ledger"
          )
  );

  write(updated, false);

  session = updated;

  return new JSONObject().put(
          "revision",
          updated.getString("revision")
  );
 }

 private void verify(String currentPassword)
         throws Exception {

  require();

  String accountEmail =
          session.getString("email");

  throttle(accountEmail);

  byte[] candidate = null;

  try {
   candidate = unwrap(
           currentPassword,
           session.getJSONObject("password"),
           session.getString("id")
                   + ":password"
   );

   if (!MessageDigest.isEqual(
           candidate,
           master
   )) {
    throw new Exception();
   }

   success(accountEmail);

  } catch (Exception error) {
   failed(accountEmail);

   throw new Exception(
           "Current password is incorrect."
   );

  } finally {
   if (candidate != null) {
    Arrays.fill(candidate, (byte) 0);
   }
  }
 }

 synchronized JSONObject change(
         JSONObject request
 ) throws Exception {

  require();

  String newPassword = password(
          request.getString("newPassword")
  );

  verify(
          request.getString("currentPassword")
  );

  JSONObject updated = new JSONObject(
          session.toString()
  );

  updated.put(
          "password",
          wrap(
                  newPassword,
                  master,
                  updated.getString("id")
                          + ":password"
          )
  );

  write(updated, false);
  session = updated;

  return new JSONObject().put("ok", true);
 }

 synchronized JSONObject rotate(
         JSONObject request
 ) throws Exception {

  require();

  verify(
          request.getString("currentPassword")
  );

  String recoveryKey = newRecovery();

  JSONObject updated = new JSONObject(
          session.toString()
  );

  updated.put(
          "recovery",
          wrap(
                  recovery(recoveryKey),
                  master,
                  updated.getString("id")
                          + ":recovery"
          )
  );

  write(updated, false);
  session = updated;

  return new JSONObject().put(
          "recoveryKey",
          recoveryKey
  );
 }

 synchronized JSONObject recover(
         JSONObject request
 ) throws Exception {

  if (session != null) {
   throw new Exception(
           "Sign out first."
   );
  }

  String accountEmail = email(
          request.getString("email")
  );

  String newPassword = password(
          request.getString("newPassword")
  );

  throttle(accountEmail);

  byte[] candidateMaster = null;

  try {
   JSONObject vault = read(accountEmail);

   candidateMaster = unwrap(
           recovery(
                   request.getString(
                           "recoveryKey"
                   )
           ),
           vault.getJSONObject("recovery"),
           vault.getString("id")
                   + ":recovery"
   );

   data(vault, candidateMaster);

   String newRecoveryKey = newRecovery();

   vault.put(
           "password",
           wrap(
                   newPassword,
                   candidateMaster,
                   vault.getString("id")
                           + ":password"
           )
   );

   vault.put(
           "recovery",
           wrap(
                   recovery(newRecoveryKey),
                   candidateMaster,
                   vault.getString("id")
                           + ":recovery"
           )
   );

   write(vault, false);
   success(accountEmail);

   return new JSONObject().put(
           "recoveryKey",
           newRecoveryKey
   );

  } catch (Exception error) {
   failed(accountEmail);

   throw new Exception(
           "Recovery details are incorrect, or the account cannot be decrypted."
   );

  } finally {
   if (candidateMaster != null) {
    Arrays.fill(
            candidateMaster,
            (byte) 0
    );
   }
  }
 }

 synchronized byte[] backup() throws Exception {
  require();
  return bytes(session.toString(2));
 }

 synchronized JSONObject restore(
         byte[] raw
 ) throws Exception {

  if (session != null) {
   throw new Exception(
           "Sign out before importing an account."
   );
  }

  if (raw == null || raw.length > 25_000_000) {
   throw new Exception(
           "Backup too large."
   );
  }

  JSONObject vault = new JSONObject(
          text(raw)
  );

  String accountEmail = email(
          vault.getString("email")
  );

  check(vault, accountEmail);
  write(vault, true);

  return new JSONObject().put(
          "email",
          accountEmail
  );
 }

 /*
  * QUICK-UNLOCK SUPPORT
  */

 /**
  * Returns a temporary copy of the currently unlocked master key.
  *
  * MainActivity must erase the returned byte array immediately
  * after QuickUnlockStore has wrapped it using Android Keystore.
  */
 synchronized byte[] copyMasterKeyForQuickUnlock()
         throws Exception {

  require();

  if (master.length != 32) {
   throw new Exception(
           "The unlocked Ledger master key is invalid."
   );
  }

  return Arrays.copyOf(
          master,
          master.length
  );
 }

 /**
  * Returns the normalized login label for the currently
  * unlocked account.
  */
 synchronized String currentEmail() throws Exception {
  require();
  return session.getString("email");
 }

 /**
  * Opens an existing vault using a master key recovered through
  * Android Keystore.
  *
  * The master key must successfully decrypt and validate the
  * existing ledger before the vault session is established.
  */
 synchronized JSONObject quickLogin(
         String rawEmail,
         byte[] suppliedMaster
 ) throws Exception {

  if (session != null || master != null) {
   throw new Exception(
           "Sign out before using quick unlock."
   );
  }

  String accountEmail = email(rawEmail);

  if (suppliedMaster == null
          || suppliedMaster.length != 32) {
   throw new Exception(
           "The quick-unlock master key is invalid."
   );
  }

  byte[] candidate = Arrays.copyOf(
          suppliedMaster,
          suppliedMaster.length
  );

  try {
   JSONObject vault = read(accountEmail);

   /*
    * This is the critical verification step. The recovered
    * Android Keystore value is accepted only if the value
    * decrypts the correct account's authenticated AES-GCM
    * ledger and produces a supported Ledger structure.
    */
   data(vault, candidate);

   session = vault;
   master = candidate;
   candidate = null;

   success(accountEmail);

   return result();

  } catch (Exception error) {
   lock();

   throw new Exception(
           "Quick unlock could not open this account. "
                   + "Use your Ledger password instead."
   );

  } finally {
   if (candidate != null) {
    Arrays.fill(candidate, (byte) 0);
   }
  }
 }
}