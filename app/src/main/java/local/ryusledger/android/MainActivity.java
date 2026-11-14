package local.ryusledger.android;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Ryu's Ledger Android activity.
 * <p>
 * Security flow:
 * <p>
 * 1. Normal account login decrypts the existing Vault.
 * 2. With explicit user approval, Android Keystore wraps a temporary
 * copy of the existing 32-byte Vault master key.
 * 3. Later launches request fingerprint, supported face authentication,
 * PIN, pattern, or phone password.
 * 4. Only after successful device authentication can Android Keystore
 * release the wrapped Vault master key.
 * 5. The Ledger password itself is never saved by this activity.
 */
public final class MainActivity extends FragmentActivity {

    private static final String HOME =
            "https://appassets.androidplatform.net/assets/ui/index.html";

    private static final long IDLE_TIMEOUT_MS =
            15L * 60L * 1000L;

    private static final int REQUEST_SAVE_FILE = 101;
    private static final int REQUEST_IMPORT_ACCOUNT = 102;
    private static final int REQUEST_WEB_FILE = 103;

    private static final int AUTHENTICATORS =
            BiometricManager.Authenticators.BIOMETRIC_STRONG
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    private WebView web;
    private Vault vault;
    private QuickUnlockStore quickUnlockStore;

    private final ExecutorService worker =
            Executors.newSingleThreadExecutor();

    private final Handler handler =
            new Handler(Looper.getMainLooper());

    private boolean picker;
    private boolean background;
    private boolean webReady;
    private boolean biometricShowing;
    private boolean sessionOpen;
    private boolean requireAuthenticationOnResume;

    private String pendingId;
    private byte[] pendingBytes;
    private ValueCallback<Uri[]> upload;

    private final Runnable idle = this::handleIdleTimeout;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        /*
         * Prevent account balances and transaction details from
         * appearing in screenshots or Android's recent-app preview.
         */
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SECURE
        );

        vault = new Vault(
                new java.io.File(
                        getFilesDir(),
                        "accounts"
                )
        );

        quickUnlockStore =
                new QuickUnlockStore(this);

        setupWebView();

        /*
         * On a fresh process, quick unlock may reopen the account
         * after the UI has loaded.
         */
        requireAuthenticationOnResume =
                quickUnlockStore.isEnabled();

        hideProtectedContent();

        web.loadUrl(HOME);
        touch();
    }

    private void setupWebView() {
        web = new WebView(this);

        web.setBackgroundColor(0xff0b101b);

        setContentView(web);

        /*
         * Keep the WebView inside the usable display area on phones and
         * tablets with status bars, camera punch-holes, display notches,
         * gesture navigation, three-button navigation, and landscape cutouts.
         *
         * Android 9 and later provide DisplayCutout safe insets. Android 8
         * continues using system-window insets.
         */
        web.setOnApplyWindowInsetsListener(
                (view, windowInsets) -> {
                    int safeLeft =
                            windowInsets.getSystemWindowInsetLeft();

                    int safeTop =
                            windowInsets.getSystemWindowInsetTop();

                    int safeRight =
                            windowInsets.getSystemWindowInsetRight();

                    int safeBottom =
                            windowInsets.getSystemWindowInsetBottom();

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        DisplayCutout displayCutout =
                                windowInsets.getDisplayCutout();

                        if (displayCutout != null) {
                            safeLeft = Math.max(
                                    safeLeft,
                                    displayCutout.getSafeInsetLeft()
                            );

                            safeTop = Math.max(
                                    safeTop,
                                    displayCutout.getSafeInsetTop()
                            );

                            safeRight = Math.max(
                                    safeRight,
                                    displayCutout.getSafeInsetRight()
                            );

                            safeBottom = Math.max(
                                    safeBottom,
                                    displayCutout.getSafeInsetBottom()
                            );
                        }
                    }

                    view.setPadding(
                            safeLeft,
                            safeTop,
                            safeRight,
                            safeBottom
                    );

                    return windowInsets;
                }
        );

        web.requestApplyInsets();

        WebSettings settings = web.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(
                WebSettings.MIXED_CONTENT_NEVER_ALLOW
        );
        settings.setSupportMultipleWindows(false);
        settings.setSaveFormData(false);

        CookieManager.getInstance()
                .setAcceptCookie(false);

        WebView.setWebContentsDebuggingEnabled(false);

        WebViewAssetLoader assetLoader =
                new WebViewAssetLoader.Builder()
                        .addPathHandler(
                                "/assets/",
                                new WebViewAssetLoader
                                        .AssetsPathHandler(this)
                        )
                        .build();

        web.setWebViewClient(
                new WebViewClient() {

                    @Override
                    public boolean shouldOverrideUrlLoading(
                            WebView view,
                            WebResourceRequest request
                    ) {
                        return !HOME.equals(
                                request.getUrl().toString()
                        );
                    }

                    @Override
                    public WebResourceResponse shouldInterceptRequest(
                            WebView view,
                            WebResourceRequest request
                    ) {
                        WebResourceResponse response =
                                assetLoader.shouldInterceptRequest(
                                        request.getUrl()
                                );

                        if (response != null) {
                            return response;
                        }

                        return new WebResourceResponse(
                                "text/plain",
                                "UTF-8",
                                403,
                                "Blocked",
                                Collections.emptyMap(),
                                new ByteArrayInputStream(
                                        new byte[0]
                                )
                        );
                    }

                    @Override
                    public void onPageFinished(
                            WebView view,
                            String url
                    ) {
                        super.onPageFinished(view, url);

                        webReady = true;

                        if (quickUnlockStore.isEnabled()
                                && !sessionOpen) {
                            requireAuthenticationOnResume = true;
                            maybeAuthenticate();
                        } else if (!requireAuthenticationOnResume) {
                            revealProtectedContent();
                        }
                    }
                }
        );

        web.setWebChromeClient(
                new WebChromeClient() {

                    @Override
                    public boolean onShowFileChooser(
                            WebView view,
                            ValueCallback<Uri[]> callback,
                            FileChooserParams parameters
                    ) {
                        if (picker) {
                            callback.onReceiveValue(null);
                            return true;
                        }

                        upload = callback;
                        picker = true;

                        try {
                            Intent intent = new Intent(
                                    Intent.ACTION_OPEN_DOCUMENT
                            )
                                    .addCategory(
                                            Intent.CATEGORY_OPENABLE
                                    )
                                    .setType("*/*");

                            startActivityForResult(
                                    intent,
                                    REQUEST_WEB_FILE
                            );

                        } catch (Exception error) {
                            picker = false;
                            upload = null;

                            callback.onReceiveValue(null);
                        }

                        return true;
                    }
                }
        );

        web.addJavascriptInterface(
                new Bridge(),
                "RyuNative"
        );
    }

    private void touch() {
        handler.removeCallbacks(idle);

        handler.postDelayed(
                idle,
                IDLE_TIMEOUT_MS
        );
    }

    @Override
    public void onUserInteraction() {
        super.onUserInteraction();
        touch();
    }

    private void handleIdleTimeout() {
        if (picker || biometricShowing) {
            touch();
            return;
        }

        hideProtectedContent();

        worker.execute(
                () -> {
                    vault.lock();
                    sessionOpen = false;

                    handler.post(
                            () -> {
                                if (isDestroyed()) {
                                    return;
                                }

                                webReady = false;
                                requireAuthenticationOnResume =
                                        quickUnlockStore.isEnabled();

                                web.loadUrl(HOME);
                            }
                    );
                }
        );
    }

    private void hideProtectedContent() {
        if (web == null) {
            return;
        }

        /*
         * INVISIBLE prevents access to the WebView while keeping its
         * current dashboard state available for a smooth return.
         */
        web.setVisibility(View.INVISIBLE);
    }

    private void revealProtectedContent() {
        if (web == null || isDestroyed()) {
            return;
        }

        web.setAlpha(0f);
        web.setVisibility(View.VISIBLE);

        web.animate()
                .alpha(1f)
                .setDuration(260L)
                .start();
    }

    private void reply(
            String id,
            Object value,
            String error
    ) {
        try {
            JSONObject result = new JSONObject()
                    .put("ok", error == null);

            if (error == null) {
                result.put(
                        "value",
                        value == null
                                ? JSONObject.NULL
                                : value
                );
            } else {
                result.put("error", error);
            }

            String script =
                    "window.__ryuNativeResult"
                            + "&&window.__ryuNativeResult("
                            + JSONObject.quote(id)
                            + ","
                            + result
                            + ");";

            handler.post(
                    () -> {
                        if (!isFinishing()
                                && !isDestroyed()) {
                            web.evaluateJavascript(
                                    script,
                                    null
                            );
                        }
                    }
            );

        } catch (Exception ignored) {
            // A malformed callback must not expose or unlock data.
        }
    }

    private void sendQuickUnlockResult(
            JSONObject account
    ) {
        String script =
                "window.__ryuQuickUnlock"
                        + "&&window.__ryuQuickUnlock("
                        + account.toString()
                        + ");";

        handler.post(
                () -> {
                    if (!isFinishing()
                            && !isDestroyed()) {
                        web.evaluateJavascript(
                                script,
                                null
                        );
                    }
                }
        );
    }

    private JSONObject quickStatus() {
        JSONObject status = new JSONObject();

        try {
            status.put(
                    "enabled",
                    quickUnlockStore.isEnabled()
            );

            status.put(
                    "email",
                    quickUnlockStore.registeredEmail()
            );

            status.put(
                    "available",
                    deviceAuthenticationAvailable()
            );

            return status;

        } catch (org.json.JSONException error) {
            /*
             * These fixed keys and primitive values should not normally
             * fail. Return an explicit safe status if Android's JSON
             * implementation unexpectedly rejects the values.
             */
            return new JSONObject();
        }
    }

    private boolean deviceAuthenticationAvailable() {
        BiometricManager biometricManager =
                BiometricManager.from(this);

        int result =
                biometricManager.canAuthenticate(
                        AUTHENTICATORS
                );

        return result
                == BiometricManager.BIOMETRIC_SUCCESS;
    }

    private void maybeAuthenticate() {
        if (!webReady
                || picker
                || biometricShowing
                || background
                || !quickUnlockStore.isEnabled()) {
            return;
        }

        if (!deviceAuthenticationAvailable()) {
            requireAuthenticationOnResume = false;

            if (!sessionOpen) {
                revealProtectedContent();
                showPasswordFallbackMessage(
                        "Phone authentication is unavailable. "
                                + "Use your Ledger password."
                );
            }

            return;
        }

        showBiometricPrompt(
                AuthenticationPurpose.UNLOCK,
                null
        );
    }

    private void showBiometricPrompt(
            AuthenticationPurpose purpose,
            String callbackId
    ) {
        if (biometricShowing) {
            if (callbackId != null) {
                reply(
                        callbackId,
                        null,
                        "Authentication is already in progress."
                );
            }

            return;
        }

        BiometricPrompt.PromptInfo promptInfo =
                new BiometricPrompt.PromptInfo.Builder()
                        .setTitle("Unlock Ryu’s Ledger")
                        .setSubtitle(
                                purpose
                                        == AuthenticationPurpose.ENABLE
                                        ? "Confirm to enable quick unlock on this device"
                                        : "Use fingerprint, face, PIN, pattern, or phone password"
                        )
                        .setAllowedAuthenticators(
                                AUTHENTICATORS
                        )
                        .setConfirmationRequired(false)
                        .build();

        BiometricPrompt prompt =
                new BiometricPrompt(
                        this,
                        ContextCompat.getMainExecutor(this),
                        new BiometricPrompt
                                .AuthenticationCallback() {

                            @Override
                            public void onAuthenticationSucceeded(
                                    @NonNull
                                    BiometricPrompt
                                            .AuthenticationResult result
                            ) {
                                super.onAuthenticationSucceeded(
                                        result
                                );

                                biometricShowing = false;
                                touch();

                                if (purpose
                                        == AuthenticationPurpose.ENABLE) {
                                    completeQuickUnlockEnable(
                                            callbackId
                                    );
                                } else {
                                    completeQuickUnlock(
                                            callbackId
                                    );
                                }
                            }

                            @Override
                            public void onAuthenticationError(
                                    int errorCode,
                                    @NonNull
                                    CharSequence errorMessage
                            ) {
                                super.onAuthenticationError(
                                        errorCode,
                                        errorMessage
                                );

                                biometricShowing = false;

                                /*
                                 * If no decrypted session exists,
                                 * revealing the ordinary login page is
                                 * safe and provides password fallback.
                                 *
                                 * If a decrypted session is retained,
                                 * keep the dashboard invisible until
                                 * authentication succeeds.
                                 */
                                if (!sessionOpen) {
                                    requireAuthenticationOnResume =
                                            false;

                                    revealProtectedContent();

                                    showPasswordFallbackMessage(
                                            "Quick unlock was cancelled. "
                                                    + "Use your Ledger password or try again."
                                    );
                                }

                                if (callbackId != null) {
                                    reply(
                                            callbackId,
                                            null,
                                            "Authentication cancelled."
                                    );
                                }
                            }

                            @Override
                            public void onAuthenticationFailed() {
                                super.onAuthenticationFailed();

                                /*
                                 * Android keeps the prompt open, so no
                                 * state change is required here.
                                 */
                            }
                        }
                );

        biometricShowing = true;
        hideProtectedContent();

        prompt.authenticate(promptInfo);
    }

    private void completeQuickUnlockEnable(
            String callbackId
    ) {
        worker.execute(
                () -> {
                    byte[] temporaryMaster = null;

                    try {
                        temporaryMaster =
                                vault.copyMasterKeyForQuickUnlock();

                        String accountEmail =
                                vault.currentEmail();

                        quickUnlockStore.enable(
                                accountEmail,
                                temporaryMaster
                        );

                        reply(
                                callbackId,
                                quickStatus(),
                                null
                        );

                        handler.post(
                                this::revealProtectedContent
                        );

                    } catch (Exception error) {
                        reply(
                                callbackId,
                                null,
                                safeMessage(error)
                        );

                        handler.post(
                                this::revealProtectedContent
                        );

                    } finally {
                        if (temporaryMaster != null) {
                            Arrays.fill(
                                    temporaryMaster,
                                    (byte) 0
                            );
                        }
                    }
                }
        );
    }

    private void completeQuickUnlock(
            String callbackId
    ) {
        /*
         * If the session remained in memory while the app was in the
         * background, phone authentication alone can reveal it again.
         */
        if (sessionOpen) {
            requireAuthenticationOnResume = false;
            revealProtectedContent();

            if (callbackId != null) {
                reply(
                        callbackId,
                        quickStatus(),
                        null
                );
            }

            return;
        }

        worker.execute(
                () -> {
                    byte[] recoveredMaster = null;

                    try {
                        String accountEmail =
                                quickUnlockStore.registeredEmail();

                        recoveredMaster =
                                quickUnlockStore.unlockMasterKey();

                        JSONObject account =
                                vault.quickLogin(
                                        accountEmail,
                                        recoveredMaster
                                );

                        sessionOpen = true;
                        requireAuthenticationOnResume = false;

                        sendQuickUnlockResult(account);

                        if (callbackId != null) {
                            reply(
                                    callbackId,
                                    account,
                                    null
                            );
                        }

                        handler.post(
                                this::revealProtectedContent
                        );

                    } catch (Exception error) {
                        sessionOpen = false;
                        requireAuthenticationOnResume = false;

                        if (callbackId != null) {
                            reply(
                                    callbackId,
                                    null,
                                    safeMessage(error)
                            );
                        }

                        handler.post(
                                () -> {
                                    revealProtectedContent();

                                    showPasswordFallbackMessage(
                                            safeMessage(error)
                                    );
                                }
                        );

                    } finally {
                        if (recoveredMaster != null) {
                            Arrays.fill(
                                    recoveredMaster,
                                    (byte) 0
                            );
                        }
                    }
                }
        );
    }

    private void showPasswordFallbackMessage(
            String message
    ) {
        String script =
                "window.__ryuQuickUnlockError"
                        + "&&window.__ryuQuickUnlockError("
                        + JSONObject.quote(message)
                        + ");";

        if (!isFinishing() && !isDestroyed()) {
            web.evaluateJavascript(script, null);
        }
    }

    private static String safeMessage(Exception error) {
        String message = error.getMessage();

        return message == null || message.trim().isEmpty()
                ? "Operation failed."
                : message;
    }

    private void lockAndReload(
            boolean forgetDevice
    ) {
        hideProtectedContent();

        worker.execute(
                () -> {
                    vault.lock();
                    sessionOpen = false;

                    if (forgetDevice) {
                        quickUnlockStore.forget();
                    }

                    handler.post(
                            () -> {
                                if (isDestroyed()) {
                                    return;
                                }

                                webReady = false;
                                requireAuthenticationOnResume =
                                        !forgetDevice
                                                && quickUnlockStore
                                                .isEnabled();

                                web.loadUrl(HOME);
                            }
                    );
                }
        );
    }

    @Override
    protected void onStop() {
        super.onStop();

        background = true;

        if (picker || biometricShowing) {
            return;
        }

        hideProtectedContent();

        /*
         * With quick unlock enabled, retain the in-memory Vault
         * session temporarily and require phone authentication before
         * revealing it again.
         *
         * Without quick unlock, preserve the previous security
         * behaviour by clearing the session and reloading login.
         */
        if (quickUnlockStore.isEnabled()) {
            requireAuthenticationOnResume = true;
        } else {
            lockAndReload(false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();

        background = false;
        touch();

        if (picker || biometricShowing) {
            return;
        }

        if (requireAuthenticationOnResume
                && quickUnlockStore.isEnabled()) {
            maybeAuthenticate();
        } else if (webReady) {
            revealProtectedContent();
        }
    }

    @Override
    public void onBackPressed() {
        if (requireAuthenticationOnResume
                && quickUnlockStore.isEnabled()) {
            maybeAuthenticate();
            return;
        }

        new AlertDialog.Builder(this)
                .setTitle("Close Ryu’s Ledger?")
                .setMessage(
                        "Saved records remain encrypted on this device. "
                                + "Quick unlock will be requested next time."
                )
                .setNegativeButton(
                        "Stay",
                        null
                )
                .setPositiveButton(
                        "Close",
                        (dialog, which) -> finish()
                )
                .show();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(idle);

        /*
         * The persistent quick-unlock wrapper remains in Android
         * Keystore. Only the current decrypted session is destroyed.
         */
        vault.lock();

        worker.shutdown();

        if (upload != null) {
            upload.onReceiveValue(null);
            upload = null;
        }

        if (pendingBytes != null) {
            Arrays.fill(
                    pendingBytes,
                    (byte) 0
            );
        }

        if (web != null) {
            web.removeJavascriptInterface(
                    "RyuNative"
            );

            web.destroy();
        }

        super.onDestroy();
    }

    private enum AuthenticationPurpose {
        UNLOCK,
        ENABLE
    }

    private final class Bridge {

        @JavascriptInterface
        public void request(
                String id,
                String method,
                String raw
        ) {
            if (id == null
                    || !id.matches("[0-9]{1,12}")
                    || raw == null
                    || raw.length() > 35_000_000) {
                return;
            }

            /*
             * Operations that must display Android UI are dispatched
             * directly to the main thread.
             */
            if ("quickEnable".equals(method)) {
                handler.post(
                        () -> showBiometricPrompt(
                                AuthenticationPurpose.ENABLE,
                                id
                        )
                );
                return;
            }

            if ("quickUnlock".equals(method)) {
                handler.post(
                        () -> showBiometricPrompt(
                                AuthenticationPurpose.UNLOCK,
                                id
                        )
                );
                return;
            }

            worker.execute(
                    () -> {
                        try {
                            JSONObject arguments =
                                    new JSONObject(raw);

                            Object output;

                            switch (method) {

                                case "register":
                                    output = vault.register(
                                            arguments
                                    );
                                    sessionOpen = true;
                                    break;

                                case "login":
                                    output = vault.login(
                                            arguments
                                    );
                                    sessionOpen = true;
                                    break;

                                case "recover":
                                    output = vault.recover(
                                            arguments
                                    );
                                    break;

                                case "save":
                                    output = vault.save(
                                            arguments
                                    );
                                    break;

                                case "change":
                                    output = vault.change(
                                            arguments
                                    );
                                    break;

                                case "rotate":
                                    output = vault.rotate(
                                            arguments
                                    );
                                    break;

                                case "lock":
                                case "lockKeepQuick":
                                    vault.lock();
                                    sessionOpen = false;
                                    output = true;
                                    break;

                                case "forgetDevice":
                                    vault.lock();
                                    sessionOpen = false;
                                    quickUnlockStore.forget();
                                    output = true;
                                    break;

                                case "quickStatus":
                                    output = quickStatus();
                                    break;

                                case "touch":
                                    handler.post(
                                            MainActivity.this::touch
                                    );
                                    output = true;
                                    break;

                                case "saveFile": {
                                    String encoded =
                                            arguments.getString(
                                                    "base64"
                                            );

                                    if (encoded.length()
                                            > 34_000_000) {
                                        throw new Exception(
                                                "Export exceeds size limit."
                                        );
                                    }

                                    byte[] data = Base64.decode(
                                            encoded,
                                            Base64.NO_WRAP
                                    );

                                    if (data.length
                                            > 25_000_000) {
                                        Arrays.fill(
                                                data,
                                                (byte) 0
                                        );

                                        throw new Exception(
                                                "Export exceeds 25 MB."
                                        );
                                    }

                                    String name = arguments
                                            .getString("name")
                                            .replaceAll(
                                                    "[^A-Za-z0-9._-]",
                                                    "_"
                                            );

                                    handler.post(
                                            () -> savePicker(
                                                    id,
                                                    data,
                                                    name
                                            )
                                    );

                                    return;
                                }

                                case "encryptedBackup": {
                                    byte[] data =
                                            vault.backup();

                                    handler.post(
                                            () -> savePicker(
                                                    id,
                                                    data,
                                                    "Ryus_Ledger_Encrypted_Account.json"
                                            )
                                    );

                                    return;
                                }

                                case "importAccount":
                                    handler.post(
                                            () -> importPicker(id)
                                    );
                                    return;

                                default:
                                    throw new Exception(
                                            "Unsupported operation."
                                    );
                            }

                            reply(id, output, null);

                        } catch (Exception error) {
                            reply(
                                    id,
                                    null,
                                    safeMessage(error)
                            );
                        }
                    }
            );
        }
    }

    private void savePicker(
            String id,
            byte[] data,
            String name
    ) {
        if (picker) {
            Arrays.fill(data, (byte) 0);

            reply(
                    id,
                    null,
                    "Finish the current file picker first."
            );

            return;
        }

        pendingId = id;
        pendingBytes = data;
        picker = true;

        String mime;

        if (name.endsWith(".xlsx")) {
            mime =
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        } else if (name.endsWith(".json")) {
            mime = "application/json";
        } else {
            mime = "text/plain";
        }

        try {
            Intent intent = new Intent(
                    Intent.ACTION_CREATE_DOCUMENT
            )
                    .addCategory(
                            Intent.CATEGORY_OPENABLE
                    )
                    .setType(mime)
                    .putExtra(
                            Intent.EXTRA_TITLE,
                            name
                    );

            startActivityForResult(
                    intent,
                    REQUEST_SAVE_FILE
            );

        } catch (Exception error) {
            clearPicker();

            reply(
                    id,
                    null,
                    "Cannot open the Android file picker."
            );
        }
    }

    private void importPicker(String id) {
        if (picker) {
            reply(
                    id,
                    null,
                    "Finish the current file picker first."
            );

            return;
        }

        pendingId = id;
        picker = true;

        try {
            Intent intent = new Intent(
                    Intent.ACTION_OPEN_DOCUMENT
            )
                    .addCategory(
                            Intent.CATEGORY_OPENABLE
                    )
                    .setType("*/*");

            startActivityForResult(
                    intent,
                    REQUEST_IMPORT_ACCOUNT
            );

        } catch (Exception error) {
            clearPicker();

            reply(
                    id,
                    null,
                    "Cannot open the Android file picker."
            );
        }
    }

    private void clearPicker() {
        if (pendingBytes != null) {
            Arrays.fill(
                    pendingBytes,
                    (byte) 0
            );
        }

        pendingBytes = null;
        pendingId = null;
        picker = false;
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent intent
    ) {
        super.onActivityResult(
                requestCode,
                resultCode,
                intent
        );

        touch();

        if (requestCode == REQUEST_WEB_FILE) {
            ValueCallback<Uri[]> callback = upload;

            upload = null;
            picker = false;

            if (callback != null) {
                callback.onReceiveValue(
                        resultCode == RESULT_OK
                                && intent != null
                                && intent.getData() != null
                                ? new Uri[]{
                                intent.getData()
                        }
                                : null
                );
            }

            return;
        }

        if (requestCode != REQUEST_SAVE_FILE
                && requestCode
                != REQUEST_IMPORT_ACCOUNT) {
            return;
        }

        final String id = pendingId;
        final byte[] data = pendingBytes;

        pendingBytes = null;
        pendingId = null;
        picker = false;

        if (id == null) {
            if (data != null) {
                Arrays.fill(data, (byte) 0);
            }

            return;
        }

        if (resultCode != RESULT_OK
                || intent == null
                || intent.getData() == null) {
            if (data != null) {
                Arrays.fill(data, (byte) 0);
            }

            reply(id, false, null);
            return;
        }

        final Uri uri = intent.getData();

        worker.execute(
                () -> {
                    try {
                        if (requestCode
                                == REQUEST_SAVE_FILE) {
                            try (OutputStream output =
                                         getContentResolver()
                                                 .openOutputStream(
                                                         uri,
                                                         "wt"
                                                 )) {
                                if (output == null) {
                                    throw new Exception(
                                            "Cannot write selected file."
                                    );
                                }

                                output.write(data);
                                output.flush();
                            }

                            reply(id, true, null);

                        } else {
                            try (InputStream input =
                                         getContentResolver()
                                                 .openInputStream(
                                                         uri
                                                 )) {
                                if (input == null) {
                                    throw new Exception(
                                            "Cannot read selected file."
                                    );
                                }

                                byte[] raw =
                                        Vault.readLimited(
                                                input,
                                                25_000_000
                                        );

                                try {
                                    reply(
                                            id,
                                            vault.restore(raw),
                                            null
                                    );
                                } finally {
                                    Arrays.fill(
                                            raw,
                                            (byte) 0
                                    );
                                }
                            }
                        }

                    } catch (Exception error) {
                        reply(
                                id,
                                null,
                                safeMessage(error)
                        );

                    } finally {
                        if (data != null) {
                            Arrays.fill(
                                    data,
                                    (byte) 0
                            );
                        }
                    }
                }
        );
    }
}