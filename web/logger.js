/**
 * PVU WebGIS - Módulo de Telemetría Avanzada (Logger)
 * Implementa un estándar de logs JSON estructurados compatible con IBM Logs / Elastic / Datadog.
 * Patrón: Singleton
 */

class LogManager {
    constructor() {
        if (LogManager.instance) {
            return LogManager.instance;
        }

        this.config = {
            appName: 'pvu-visor',
            env: window.location.hostname.includes('localhost') ? 'dev' : 'production',
            version: '4.1.0', // Sincronizado con versión de deploy
            logLevel: 'INFO', // DEBUG, INFO, WARN, ERROR
            enableConsole: true,
            ingestionUrl: null // URL para envío remoto (ej. LogDNA / IBM Log Analysis ingestion endpoint)
        };

        // Contexto persistente de la sesión
        this.context = {
            sessionId: this.generateUUID(),
            userAgent: navigator.userAgent,
            screen: `${window.screen.width}x${window.screen.height}`,
            language: navigator.language,
            platform: navigator.platform
        };

        // Niveles de severidad numéricos para filtrado
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };

        LogManager.instance = this;

        // Captura global de errores no manejados
        this.initGlobalHandlers();
    }

    configure(options) {
        this.config = { ...this.config, ...options };
        this.info('System', 'Logger configured', options);
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    shouldLog(level) {
        return this.levels[level] >= this.levels[this.config.logLevel || 'INFO'];
    }

    /**
     * Construye el objeto de log estructurado (JSON Schema)
     */
    createLogObject(level, scope, message, meta = {}) {
        return {
            ts: new Date().toISOString(),
            level: level,
            app: this.config.appName,
            env: this.config.env,
            v: this.config.version,
            scope: scope,
            msg: message,
            // Contexto extendido incrustado
            ctx: {
                sid: this.context.sessionId
            },
            // Metadata específica del evento
            meta: meta
        };
    }

    print(logObject) {
        if (!this.config.enableConsole) return;

        // Estilo visual para consola de navegador (DX)
        const styles = {
            DEBUG: 'color: #7f8c8d;',
            INFO: 'color: #2980b9; font-weight: bold;',
            WARN: 'color: #f39c12; font-weight: bold;',
            ERROR: 'color: #c0392b; font-weight: bold; background: #fadbd8; padding: 2px;'
        };

        if (this.config.env === 'dev') {
            // Formato legible para humanos en desarrollo
            console.log(
                `%c[${logObject.level}] %c[${logObject.scope}]`,
                styles[logObject.level],
                'color: #333; font-weight: bold;',
                logObject.msg,
                logObject.meta
            );
        } else {
            // Formato JSON puro para producción (IBM Logs "scrapea" esto si se redirige o para herramientas de red)
            console.log(JSON.stringify(logObject));
        }
    }

    sendBeacon(logObject) {
        // Si hay una URL de ingestión configurada, enviamos el log asíncronamente
        // Esto es ideal para enviar logs a IBM Log Analysis / LogDNA vía HTTP
        if (this.config.ingestionUrl) {
            const blob = new Blob([JSON.stringify(logObject)], { type: 'application/json' });
            navigator.sendBeacon(this.config.ingestionUrl, blob);
        }
    }

    // ─────────────────────────────────────────────────────────
    // MÉTODOS PÚBLICOS DE LOGGING
    // ─────────────────────────────────────────────────────────

    debug(scope, message, meta) {
        if (this.shouldLog('DEBUG')) {
            const log = this.createLogObject('DEBUG', scope, message, meta);
            this.print(log);
        }
    }

    info(scope, message, meta) {
        if (this.shouldLog('INFO')) {
            const log = this.createLogObject('INFO', scope, message, meta);
            this.print(log);
            this.sendBeacon(log);
        }
    }

    warn(scope, message, meta) {
        if (this.shouldLog('WARN')) {
            const log = this.createLogObject('WARN', scope, message, meta);
            this.print(log);
            this.sendBeacon(log);
        }
    }

    error(scope, message, errorOrMeta) {
        if (this.shouldLog('ERROR')) {
            let meta = errorOrMeta;

            // Si el meta es un objeto Error nativo, lo serializamos correctamente
            if (errorOrMeta instanceof Error) {
                meta = {
                    name: errorOrMeta.name,
                    message: errorOrMeta.message,
                    stack: errorOrMeta.stack
                };
            }

            const log = this.createLogObject('ERROR', scope, message, meta);
            this.print(log);
            // Siempre intentamos enviar errores al servidor
            this.sendBeacon(log);
        }
    }

    // ─────────────────────────────────────────────────────────
    // MANEJADORES GLOBALES
    // ─────────────────────────────────────────────────────────

    initGlobalHandlers() {
        window.onerror = (msg, url, lineNo, columnNo, error) => {
            this.error('Global', 'Uncaught Exception', {
                msg, url, lineNo, columnNo,
                stack: error ? error.stack : null
            });
            return false; // Dejar que el error se propague a consola también
        };

        window.onunhandledrejection = (event) => {
            this.error('Global', 'Unhandled Promise Rejection', {
                reason: event.reason
            });
        };
    }
}

// Exportar instancia única
const Logger = new LogManager();
