package local.ryusledger.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.security.KeyStore;
import java.security.UnrecoverableKeyException;
import java.util.Arrays;

import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import android.security.keystore.UserNotAuthenticatedException;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Stores one device-registered quick-unlock wrapper.
 *
 * The Ryu's Ledger password is never stored here.
 * Android Keystore protects an AES key that encrypts a copy of the
 * existing 32-byte Ledger master key.
 *
 * MainActivity must authenticate the user through BiometricPrompt
 * before calling unlockMasterKey().
 */
final class QuickUnlockStore {

    static final String KEY_ALIAS =
            "local.ryusledger.android.quick_unlock.v1";

    private static final String PREFS =
            "ryus_ledger_quick_unlock";

    private static final String PREF_ENABLED =
            "enabled";

    private static final String PREF_EMAIL =
            "email";

    private static final String PREF_IV =
            "iv";

    private static final String PREF_WRAPPED_MASTER =
            "wrapped_master";

    private static final String PREF_FORMAT =
            "format";

    private static final int CURRENT_FORMAT = 1;

    /*
     * Authentication remains valid briefly after the Android prompt.
     * This gives MainActivity enough time to call unlockMasterKey()
     * after fingerprint, face, PIN, pattern, or password succeeds.
     */
    private static final int AUTH_VALIDITY_SECONDS = 30;

    private final SharedPreferences preferences;

    QuickUnlockStore(Context context) {
        preferences = context.getSharedPreferences(
                PREFS,
                Context.MODE_PRIVATE
        );
    }

    synchronized boolean isEnabled() {
        return preferences.getBoolean(PREF_ENABLED, false)
                && preferences.getInt(PREF_FORMAT, 0) == CURRENT_FORMAT
                && !preferences.getString(PREF_EMAIL, "").isEmpty()
                && !preferences.getString(PREF_IV, "").isEmpty()
                && !preferences.getString(
                PREF_WRAPPED_MASTER,
                ""
        ).isEmpty()
                && hasKey();
    }

    synchronized String registeredEmail() {
        if (!isEnabled()) {
            return "";
        }

        return preferences.getString(PREF_EMAIL, "");
    }

    /**
     * Creates or replaces the device's quick-unlock registration.
     *
     * Call this only after a successful normal Ledger-password login
     * and explicit user approval.
     */
    synchronized void enable(
            String email,
            byte[] masterKey
    ) throws Exception {

        if (email == null || email.trim().isEmpty()) {
            throw new Exception(
                    "Cannot enable quick unlock without an account."
            );
        }

        if (masterKey == null || masterKey.length != 32) {
            throw new Exception(
                    "The Ledger master key is invalid."
            );
        }

        byte[] temporaryCopy = Arrays.copyOf(
                masterKey,
                masterKey.length
        );

        try {
            /*
             * Recreate the key so that changing account registration
             * does not accidentally reuse an older wrapper.
             */
            deleteKeystoreKey();

            SecretKey secretKey = createKeystoreKey();

            Cipher cipher = Cipher.getInstance(
                    "AES/GCM/NoPadding"
            );

            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    secretKey
            );

            cipher.updateAAD(
                    aad(email)
            );

            byte[] wrapped = cipher.doFinal(temporaryCopy);
            byte[] iv = cipher.getIV();

            boolean saved = preferences.edit()
                    .clear()
                    .putBoolean(PREF_ENABLED, true)
                    .putInt(PREF_FORMAT, CURRENT_FORMAT)
                    .putString(
                            PREF_EMAIL,
                            email.trim().toLowerCase()
                    )
                    .putString(
                            PREF_IV,
                            Base64.encodeToString(
                                    iv,
                                    Base64.NO_WRAP
                            )
                    )
                    .putString(
                            PREF_WRAPPED_MASTER,
                            Base64.encodeToString(
                                    wrapped,
                                    Base64.NO_WRAP
                            )
                    )
                    .commit();

            if (!saved) {
                deleteKeystoreKey();

                throw new Exception(
                        "Android could not save the quick-unlock registration."
                );
            }

        } finally {
            Arrays.fill(temporaryCopy, (byte) 0);
        }
    }

    /**
     * Decrypts the wrapped Ledger master key.
     *
     * MainActivity must call BiometricPrompt first. If Android does
     * not have a recent valid authentication token, Keystore throws
     * UserNotAuthenticatedException and the ledger stays locked.
     */
    synchronized byte[] unlockMasterKey() throws Exception {

        if (!isEnabled()) {
            throw new Exception(
                    "Quick unlock is not enabled on this device."
            );
        }

        String email = registeredEmail();

        byte[] iv = Base64.decode(
                preferences.getString(PREF_IV, ""),
                Base64.NO_WRAP
        );

        byte[] wrapped = Base64.decode(
                preferences.getString(
                        PREF_WRAPPED_MASTER,
                        ""
                ),
                Base64.NO_WRAP
        );

        if (iv.length != 12) {
            forget();

            throw new Exception(
                    "Quick-unlock information is damaged. Sign in with your Ledger password."
            );
        }

        try {
            SecretKey secretKey = loadKeystoreKey();

            Cipher cipher = Cipher.getInstance(
                    "AES/GCM/NoPadding"
            );

            cipher.init(
                    Cipher.DECRYPT_MODE,
                    secretKey,
                    new GCMParameterSpec(128, iv)
            );

            cipher.updateAAD(
                    aad(email)
            );

            byte[] masterKey = cipher.doFinal(wrapped);

            if (masterKey.length != 32) {
                Arrays.fill(masterKey, (byte) 0);
                forget();

                throw new Exception(
                        "The quick-unlock master key is invalid."
                );
            }

            return masterKey;

        } catch (UserNotAuthenticatedException error) {
            throw new Exception(
                    "Authenticate with fingerprint or the phone lock first."
            );

        } catch (AEADBadTagException error) {
            forget();

            throw new Exception(
                    "Quick unlock is no longer valid. Sign in with your Ledger password."
            );

        } catch (UnrecoverableKeyException error) {
            forget();

            throw new Exception(
                    "Android invalidated quick unlock. Sign in with your Ledger password and enable it again."
            );
        }
    }

    /**
     * Removes the quick-unlock wrapper and Android Keystore key.
     * The encrypted Ledger account and financial records are untouched.
     */
    synchronized void forget() {
        preferences.edit()
                .clear()
                .commit();

        try {
            deleteKeystoreKey();
        } catch (Exception ignored) {
            /*
             * Preferences are already removed. A missing or invalid
             * Android Keystore entry cannot restore quick unlock.
             */
        }
    }

    synchronized boolean hasKey() {
        try {
            KeyStore keyStore = openKeyStore();
            return keyStore.containsAlias(KEY_ALIAS);

        } catch (Exception ignored) {
            return false;
        }
    }

    private SecretKey createKeystoreKey() throws Exception {

        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
        );

        KeyGenParameterSpec.Builder builder =
                new KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT
                                | KeyProperties.PURPOSE_DECRYPT
                )
                        .setBlockModes(
                                KeyProperties.BLOCK_MODE_GCM
                        )
                        .setEncryptionPaddings(
                                KeyProperties.ENCRYPTION_PADDING_NONE
                        )
                        .setKeySize(256)
                        .setUserAuthenticationRequired(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(
                    AUTH_VALIDITY_SECONDS,
                    KeyProperties.AUTH_BIOMETRIC_STRONG
                            | KeyProperties.AUTH_DEVICE_CREDENTIAL
            );
        } else {
            /*
             * Android 8–10 use the older validity-duration API.
             * The phone must still have a secure screen lock configured.
             */
            builder.setUserAuthenticationValidityDurationSeconds(
                    AUTH_VALIDITY_SECONDS
            );
        }

        /*
         * Keep device credential as the durable recovery method.
         * Adding or changing a fingerprint should not delete the
         * encrypted ledger or the quick-unlock registration outright.
         */
        builder.setInvalidatedByBiometricEnrollment(false);

        generator.init(builder.build());

        return generator.generateKey();
    }

    private SecretKey loadKeystoreKey() throws Exception {

        KeyStore keyStore = openKeyStore();

        if (!keyStore.containsAlias(KEY_ALIAS)) {
            throw new UnrecoverableKeyException(
                    "Quick-unlock key is missing."
            );
        }

        KeyStore.Entry entry = keyStore.getEntry(
                KEY_ALIAS,
                null
        );

        if (!(entry instanceof KeyStore.SecretKeyEntry)) {
            throw new UnrecoverableKeyException(
                    "Quick-unlock key has an invalid type."
            );
        }

        return ((KeyStore.SecretKeyEntry) entry)
                .getSecretKey();
    }

    private void deleteKeystoreKey() throws Exception {

        KeyStore keyStore = openKeyStore();

        if (keyStore.containsAlias(KEY_ALIAS)) {
            keyStore.deleteEntry(KEY_ALIAS);
        }
    }

    private KeyStore openKeyStore() throws Exception {

        KeyStore keyStore = KeyStore.getInstance(
                "AndroidKeyStore"
        );

        keyStore.load(null);

        return keyStore;
    }

    private static byte[] aad(String email) {
        return (
                "Ryu's Ledger quick unlock v1:"
                        + email.trim().toLowerCase()
        ).getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }
}