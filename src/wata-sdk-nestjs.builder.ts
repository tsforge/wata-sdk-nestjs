import { ConfigurableModuleBuilder } from '@nestjs/common';
import { IWataModuleOptions } from './interfaces';

// name is a registration-time extra, not part of the SDK config: it never reaches
// createWataSdkFactory, only getWataToken() to key the DI provider for this instance
export interface IWataExtraOptions {
    name?: string;
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN, OPTIONS_TYPE, ASYNC_OPTIONS_TYPE } =
    new ConfigurableModuleBuilder<IWataModuleOptions>()
        .setFactoryMethodName('forRootAsync')
        .setClassMethodName('forRoot')
        .setExtras<IWataExtraOptions>({}, (definition) => definition)
        .build();
