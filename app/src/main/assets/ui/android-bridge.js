'use strict';

(() => {
    const pending = new Map();

    let nextRequestId = 0;
    let queuedQuickAccount = null;
    let queuedQuickError = '';

    /**
     * Receives normal request results from MainActivity.
     */
    window.__ryuNativeResult = (id, response) => {
        const request = pending.get(String(id));

        if (!request) {
            return;
        }

        pending.delete(String(id));
        clearTimeout(request.timeout);

        if (response && response.ok) {
            request.resolve(response.value);
        } else {
            request.reject(
                new Error(
                    response?.error
                    || 'Operation failed.'
                )
            );
        }
    };

    /**
     * Sends one operation to MainActivity.
     */
    function call(method, argumentsObject = {}) {
        return new Promise((resolve, reject) => {
            if (!window.RyuNative) {
                reject(
                    new Error(
                        'Open the installed Android application.'
                    )
                );
                return;
            }

            const id = String(++nextRequestId);

            /*
             * Prevent an unresolved request from staying in memory
             * forever if Android closes the activity unexpectedly.
             *
             * File pickers receive a longer timeout because the user
             * may take time choosing a destination.
             */
            const longOperation = [
                'saveFile',
                'encryptedBackup',
                'importAccount'
            ].includes(method);

            const timeout = window.setTimeout(() => {
                if (!pending.has(id)) {
                    return;
                }

                pending.delete(id);

                reject(
                    new Error(
                        'The Android operation timed out. Please try again.'
                    )
                );
            }, longOperation ? 10 * 60 * 1000 : 2 * 60 * 1000);

            pending.set(id, {
                resolve,
                reject,
                timeout
            });

            try {
                window.RyuNative.request(
                    id,
                    method,
                    JSON.stringify(argumentsObject)
                );
            } catch (error) {
                clearTimeout(timeout);
                pending.delete(id);
                reject(error);
            }
        });
    }

    /**
     * Converts the generated workbook or backup bytes to Base64 before
     * passing them to Android's document picker.
     */
    async function saveFile(argumentsObject) {
        if (!(argumentsObject.bytes instanceof Uint8Array)) {
            throw new Error('Invalid export bytes.');
        }

        if (argumentsObject.bytes.length > 25_000_000) {
            throw new Error('Export exceeds 25 MB.');
        }

        const chunks = [];

        for (
            let index = 0;
            index < argumentsObject.bytes.length;
            index += 8192
        ) {
            chunks.push(
                String.fromCharCode(
                    ...argumentsObject.bytes.subarray(
                        index,
                        index + 8192
                    )
                )
            );
        }

        const binary = chunks.join('');

        return call('saveFile', {
            name: argumentsObject.name,
            ext: argumentsObject.ext,
            base64: btoa(binary)
        });
    }

    /**
     * Enters the existing application workspace using the account
     * object returned by native quick unlock.
     */
    function enterQuickAccount(account) {
        if (!account || typeof account !== 'object') {
            showQuickError(
                'Quick unlock returned invalid account information. '
                + 'Use your Ledger password instead.'
            );
            return false;
        }

        /*
         * app.js declares enter() as a global function in the existing
         * classic script. Wait briefly if app.js is still completing
         * its initial page setup.
         */
        if (typeof window.enter === 'function') {
            queuedQuickAccount = null;
            queuedQuickError = '';

            window.enter(account);

            window.dispatchEvent(
                new CustomEvent(
                    'ryu-quick-unlock-success',
                    {
                        detail: {
                            email: account.email || ''
                        }
                    }
                )
            );

            return true;
        }

        queuedQuickAccount = account;
        return false;
    }

    /**
     * Shows quick-unlock cancellation or failure on the ordinary
     * sign-in screen, preserving password and recovery fallback.
     */
    function showQuickError(message) {
        const safeMessage =
            String(
                message
                || 'Quick unlock was unavailable. '
                + 'Use your Ledger password.'
            );

        queuedQuickError = safeMessage;

        if (typeof window.authView === 'function') {
            queuedQuickError = '';

            window.authView(
                'login',
                safeMessage
            );

            window.dispatchEvent(
                new CustomEvent(
                    'ryu-quick-unlock-error',
                    {
                        detail: {
                            message: safeMessage
                        }
                    }
                )
            );

            return true;
        }

        return false;
    }

    /**
     * Called by MainActivity after Android Keystore successfully opens
     * the encrypted account.
     */
    window.__ryuQuickUnlock = account => {
        enterQuickAccount(account);
    };

    /**
     * Called by MainActivity when device authentication is cancelled,
     * unavailable, invalidated, or unable to open the selected account.
     */
    window.__ryuQuickUnlockError = message => {
        showQuickError(message);
    };

    /**
     * Retry queued native callbacks after app.js has completed loading.
     */
    function flushQueuedNativeState() {
        if (
            queuedQuickAccount
            && typeof window.enter === 'function'
        ) {
            enterQuickAccount(queuedQuickAccount);
            return;
        }

        if (
            queuedQuickError
            && typeof window.authView === 'function'
        ) {
            showQuickError(queuedQuickError);
        }
    }

    document.addEventListener(
        'DOMContentLoaded',
        flushQueuedNativeState,
        {
            once: true
        }
    );

    window.addEventListener(
        'load',
        flushQueuedNativeState,
        {
            once: true
        }
    );

    /*
     * A final short retry handles slower devices where app.js creates
     * the account UI just after the page load event.
     */
    window.setTimeout(
        flushQueuedNativeState,
        150
    );

    window.setTimeout(
        flushQueuedNativeState,
        500
    );

    window.desktop = Object.freeze({
        register: argumentsObject =>
            call('register', argumentsObject),

        login: argumentsObject =>
            call('login', argumentsObject),

        recover: argumentsObject =>
            call('recover', argumentsObject),

        change: argumentsObject =>
            call('change', argumentsObject),

        rotate: argumentsObject =>
            call('rotate', argumentsObject),

        save: argumentsObject =>
            call('save', argumentsObject),

        encryptedBackup: () =>
            call('encryptedBackup'),

        importAccount: () =>
            call('importAccount'),

        saveFile,

        touch: () =>
            call('touch').catch(() => undefined),

        /**
         * Returns:
         * {
         *   enabled: boolean,
         *   available: boolean,
         *   email: string
         * }
         */
        quickStatus: () =>
            call('quickStatus'),

        /**
         * Requires an existing password-unlocked Vault session.
         * MainActivity displays Android authentication before wrapping
         * the current Vault master key with Android Keystore.
         */
        quickEnable: () =>
            call('quickEnable'),

        /**
         * Displays fingerprint, supported face authentication, PIN,
         * pattern, or phone password and then reopens the saved account.
         */
        quickUnlock: () =>
            call('quickUnlock'),

        /**
         * Clears the current decrypted Vault session while preserving
         * the Android Keystore quick-unlock registration.
         */
        lock: () =>
            call('lockKeepQuick'),

        lockKeepQuick: () =>
            call('lockKeepQuick'),

        /**
         * Deletes the quick-unlock registration and clears the active
         * session. The encrypted account and financial records remain.
         */
        forgetDevice: () =>
            call('forgetDevice')
    });

    /*
     * Android always starts in the approved touch-friendly mobile
     * layout. The application's layout control can still switch to
     * PC mode when required.
     */
    document.body.classList.add('compact');
})();