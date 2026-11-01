import { Inject } from '@nestjs/common';
import { getWataToken } from '../../common/constants';

export function InjectWata(name?: string): ParameterDecorator {
    return Inject(getWataToken(name));
}
