function log(level: 'info' | 'warn' | 'error'): (str: string, ...rest: string[]) => void {
    return (str: string, ...rest: string[]) => {
        const logdata = {
            timestamp: new Date().toISOString(),
            level,
            message: str,
            details: rest.length ? rest : undefined
        };
        console.log(JSON.stringify(logdata));
    }
}

export const logger = {
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
};