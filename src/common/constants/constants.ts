export const MODULE_NAME = 'WATA_SDK_NESTJS';

// Default instance keeps the plain MODULE_NAME token; a named one gets its own token,
// so forRoot()/forRootAsync() can be called more than once for several WATA terminals
export const getWataToken = (name?: string): string =>
    name ? `${MODULE_NAME}_${name}` : MODULE_NAME;
