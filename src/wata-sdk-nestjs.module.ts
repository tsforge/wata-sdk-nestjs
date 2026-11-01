import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { getWataToken } from './common/constants';
import { createWataSdkFactory } from './common/utils';
import {
    ASYNC_OPTIONS_TYPE,
    ConfigurableModuleClass,
    MODULE_OPTIONS_TOKEN,
    OPTIONS_TYPE,
} from './wata-sdk-nestjs.builder';
import { Wata } from '@tsforge7/wata-sdk';
import { IWataModuleOptions } from './interfaces';

@Global()
@Module({})
export class WataNestjsModule extends ConfigurableModuleClass {
    public static forRoot(options: typeof OPTIONS_TYPE): DynamicModule {
        const { name, ...wataConfig } = options;
        const WataSdkProvider: Provider = {
            provide: getWataToken(name),
            useFactory: (): Wata => createWataSdkFactory(wataConfig),
        };

        const { providers, exports, ...rest } = super.forRoot(options);

        return {
            providers: [...(providers ?? []), WataSdkProvider],
            exports: [...(exports ?? []), WataSdkProvider],
            ...rest,
        };
    }

    public static forRootAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
        const WataSdkProvider: Provider = {
            provide: getWataToken(options.name),
            useFactory: (wataModuleOptions: IWataModuleOptions): Wata =>
                createWataSdkFactory(wataModuleOptions),
            inject: [MODULE_OPTIONS_TOKEN],
        };

        const { providers, exports, ...rest } = super.forRootAsync(options);

        return {
            providers: [...(providers ?? []), WataSdkProvider],
            exports: [...(exports ?? []), WataSdkProvider],
            ...rest,
        };
    }
}
