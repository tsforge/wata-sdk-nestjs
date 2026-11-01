import { Wata } from '@tsforge7/wata-sdk';
import { Logger } from '@nestjs/common';
import { IWataConfig } from './interfaces';
const logger = new Logger('wata-sdk-nestjs');

export function createWataSdkFactory(moduleOptions: IWataConfig): Wata {
    const wataSdk = new Wata(moduleOptions);
    logger.log(`WataSdk initialized`);
    return wataSdk;
}
