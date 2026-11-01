# WATA SDK для NestJS

[English](./README.md) | **Русский**

## Установка

```bash
npm install @tsforge7/wata-sdk-nestjs @tsforge7/wata-sdk
```

![npm version](https://img.shields.io/npm/v/@tsforge7/wata-sdk-nestjs)
![License](https://img.shields.io/npm/l/@tsforge7/wata-sdk-nestjs)
![Build Status](https://img.shields.io/github/actions/workflow/status/tsforge/wata-sdk-nestjs/ci.yml)

NestJS-модуль для эквайринга [WATA](https://wata.pro): платёжные ссылки, H2H-платежи картой/СБП/T-Pay, возвраты, подписки, баланс и проверка подписи webhook-уведомлений.

Это обёртка над [@tsforge7/wata-sdk](https://github.com/tsforge/wata-sdk) - она регистрирует готовый экземпляр `Wata` в DI-контейнере NestJS и даёт декоратор `@InjectWata()` для внедрения в сервисы.

📖 [Официальная документация WATA](https://api.wata.pro) · [Документация SDK](https://github.com/tsforge/wata-sdk)

---

## Оглавление

- [Установка](#установка)
- [Быстрый старт](#быстрый-старт)
- [Конфигурация](#конфигурация)
    - [Синхронная - `forRoot()`](#синхронная---forroot)
    - [Множественные инстансы](#множественные-инстансы)
    - [Асинхронная - `forRootAsync()`](#асинхронная---forrootasync)
- [Что умеет SDK](#что-умеет-sdk)
- [Примеры](#примеры)
    - [Сервис](#сервис)
    - [CQRS-хендлер](#cqrs-хендлер)
    - [Webhook-уведомления](#webhook-уведомления)
- [Обработка ошибок](#обработка-ошибок)
- [API модуля](#api-модуля)
- [Требования](#требования)
- [Как внести изменения](#как-внести-изменения)
- [Лицензия](#лицензия)

---

## Быстрый старт

**1. Подключите модуль** - он глобальный, достаточно одного импорта в `AppModule`:

```typescript
import { Module } from '@nestjs/common';
import { WataNestjsModule } from '@tsforge7/wata-sdk-nestjs';

@Module({
    imports: [
        WataNestjsModule.forRoot({
            token: process.env.WATA_TOKEN!,
        }),
    ],
})
export class AppModule {}
```

**2. Внедрите SDK и создайте платёжную ссылку:**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectWata } from '@tsforge7/wata-sdk-nestjs';
import { Wata } from '@tsforge7/wata-sdk';

@Injectable()
export class PaymentService {
    constructor(@InjectWata() private readonly wata: Wata) {}

    public async createPaymentLink(amount: number, orderId: string) {
        const link = await this.wata.api.links.create({
            amount,
            orderId, // номер заказа у вас: WATA вернёт его в webhook
            description: `Заказ #${orderId}`,
            successRedirectUrl: 'https://myshop.com/success',
            failRedirectUrl: 'https://myshop.com/fail',
        });

        // link.url - отправьте покупателя по этой ссылке
        return link;
    }
}
```

**3. Дальше:** покупатель платит → WATA присылает [webhook](#webhook-уведомления) → вы зачисляете заказ.

## Конфигурация

| Параметр    | Обязательный | Описание                                                                                           |
| ----------- | ------------ | -------------------------------------------------------------------------------------------------- |
| `token`     | да           | Bearer access token (JWT) терминала из личного кабинета мерчанта                                   |
| `apiUrl`    | нет          | URL API, по умолчанию `https://api.wata.pro/api/h2h/`                                              |
| `currency`  | нет          | Валюта по умолчанию для ссылок и платежей картой: `RUB` (по умолчанию), `USD`, `EUR`, `GBP`, `BYN` |
| `timeout`   | нет          | Таймаут запроса в мс, по умолчанию `60000`                                                         |
| `publicKey` | нет          | Публичный ключ для webhook в PEM. Без него ключ загружается из API и кешируется                    |
| `fetch`     | нет          | Своя реализация `fetch`, например `undici` с прокси-агентом                                        |

Токен выдаёт ваш менеджер WATA, также он доступен в личном кабинете мерчанта в разделе **«Терминалы»**. Конфигурация валидируется при старте приложения: если токена нет или он некорректен - упадёт сразу с понятной ошибкой, а не на первом запросе.

> ⚠️ **Никогда не коммитьте токен в git.** SDK работает только на сервере - храните токен в переменной окружения, он даёт полный доступ к терминалу.

### Синхронная - `forRoot()`

Подходит, когда токен доступен на этапе загрузки модуля:

```typescript
WataNestjsModule.forRoot({
    token: process.env.WATA_TOKEN!,
});
```

### Асинхронная - `forRootAsync()`

Подходит, когда токен приходит из `ConfigService` или другого провайдера:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WataNestjsModule, IWataModuleOptions } from '@tsforge7/wata-sdk-nestjs';

@Module({
    imports: [
        WataNestjsModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (config: ConfigService): IWataModuleOptions => ({
                token: config.getOrThrow<string>('WATA_TOKEN'),
            }),
            inject: [ConfigService],
        }),
    ],
})
export class AppModule {}
```

### Множественные инстансы

Вызовите `forRoot()` / `forRootAsync()` несколько раз с разным `name`, чтобы зарегистрировать несколько независимых экземпляров `Wata` - например, несколько терминалов WATA в одном приложении. Без `name` получаете дефолтный инстанс, как и раньше.

```typescript
@Module({
    imports: [
        WataNestjsModule.forRoot({ name: 'storeA', token: process.env.WATA_TOKEN_A! }),
        WataNestjsModule.forRoot({ name: 'storeB', token: process.env.WATA_TOKEN_B! }),
    ],
})
export class AppModule {}
```

```typescript
@Injectable()
export class PaymentService {
    constructor(
        @InjectWata('storeA') private readonly wataA: Wata,
        @InjectWata('storeB') private readonly wataB: Wata,
    ) {}
}
```

`name` работает так же и для `forRootAsync()`. Модуль остаётся `@Global()` - именованные инстансы доступны в любом месте приложения без повторных импортов.

## Что умеет SDK

Внедрённый экземпляр `Wata` даёт доступ к REST API (`wata.api`) и к webhook-уведомлениям (`wata.webhooks`):

| Что нужно сделать                            | Метод                                      |
| -------------------------------------------- | ------------------------------------------ |
| Платёжная ссылка (метод выбирает плательщик) | `wata.api.links.create()`                  |
| Статус/поиск платёжной ссылки                | `wata.api.links.get()` / `.find()`         |
| H2H-платёж картой                            | `wata.api.payments.card()`                 |
| H2H-платёж через СБП                         | `wata.api.payments.sbp()`                  |
| H2H-платёж через T-Pay                       | `wata.api.payments.tPay()`                 |
| Статус/поиск транзакции                      | `wata.api.transactions.get()` / `.find()`  |
| Возврат платежа                              | `wata.api.transactions.refund()`           |
| Статус/поиск подписки                        | `wata.api.subscriptions.get()` / `.find()` |
| Остановить подписку                          | `wata.api.subscriptions.complete()`        |
| Баланс за день                               | `wata.api.finance.balance()`               |
| Публичный ключ для webhook                   | `wata.api.publicKey.get()`                 |
| Проверка и разбор webhook                    | `wata.webhooks.parse()` / `.verify()`      |

Константы (`CURRENCY`, `TRANSACTION_STATUS`, `PAYMENT_LINK_STATUS`, `ERROR_CODE`...), zod-схемы и все типы запросов/ответов экспортируются из корня `@tsforge7/wata-sdk` - глубокие импорты не нужны. Полное описание - в [документации SDK](https://github.com/tsforge/wata-sdk).

## Примеры

### Сервис

```typescript
import { Injectable } from '@nestjs/common';
import { InjectWata } from '@tsforge7/wata-sdk-nestjs';
import { CURRENCY, Wata } from '@tsforge7/wata-sdk';

@Injectable()
export class PaymentService {
    constructor(@InjectWata() private readonly wata: Wata) {}

    public async createPaymentLink(amount: number, orderId: string) {
        return this.wata.api.links.create({
            amount,
            currency: CURRENCY.RUB,
            orderId,
            description: `Заказ #${orderId}`,
            successRedirectUrl: 'https://myshop.com/success',
            failRedirectUrl: 'https://myshop.com/fail',
        });
    }

    // Проверка статуса
    public async getStatus(transactionId: string) {
        const transaction = await this.wata.api.transactions.get(transactionId);
        return transaction.transactionStatus; // 'Created' | 'Pending' | 'Paid' | 'Declined'
    }
}
```

### CQRS-хендлер

Пример для проектов на `@nestjs/cqrs`:

```typescript
// create-payment-link.command.ts
export class CreatePaymentLinkCommand {
    constructor(
        public readonly amount: number,
        public readonly uuid: string,
    ) {}
}
```

```typescript
// create-payment-link.handler.ts
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { ZodError } from 'zod';
import { Wata, WataApiError } from '@tsforge7/wata-sdk';
import { InjectWata } from '@tsforge7/wata-sdk-nestjs';
import { CreatePaymentLinkCommand } from './create-payment-link.command';
import { ICommandResponse } from '@common/types/command-response.type';
import { ERRORS } from '@libs/contracts/constants';

type TResponse = ICommandResponse<Awaited<ReturnType<Wata['api']['links']['create']>>>;

@CommandHandler(CreatePaymentLinkCommand)
export class CreatePaymentLinkHandler implements ICommandHandler<
    CreatePaymentLinkCommand,
    TResponse
> {
    public readonly logger = new Logger(CreatePaymentLinkHandler.name);

    constructor(@InjectWata() private readonly wata: Wata) {}

    public async execute(command: CreatePaymentLinkCommand): Promise<TResponse> {
        try {
            const { amount, uuid } = command;

            const link = await this.wata.api.links.create({
                amount,
                orderId: uuid, // вернётся в webhook
                description: `Заказ #${uuid}`,
                successRedirectUrl: 'https://myshop.com/success',
                failRedirectUrl: 'https://myshop.com/fail',
            });

            return {
                isSuccess: true,
                data: link, // link.url, link.id
            };
        } catch (error: unknown) {
            // Невалидные параметры - SDK отклонил запрос ДО отправки (сумма, обязательные поля...)
            if (error instanceof ZodError) {
                this.logger.error(
                    `[CreatePaymentLinkHandler] Invalid payment params: ${JSON.stringify(error.issues)}`,
                );
                return {
                    isSuccess: false,
                    ...ERRORS.CREATE_PAYMENT_LINK_INVALID_PARAMS,
                };
            }

            // Ошибка API WATA: не-2xx ответ
            if (error instanceof WataApiError) {
                this.logger.error(`[CreatePaymentLinkHandler] WATA API error: ${error.message}`);
                return {
                    isSuccess: false,
                    ...ERRORS.CREATE_PAYMENT_LINK_FAILED,
                };
            }

            this.logger.error(`[CreatePaymentLinkHandler] Unknown error: ${JSON.stringify(error)}`);
            return {
                isSuccess: false,
                ...ERRORS.INTERNAL_SERVER_ERROR,
            };
        }
    }
}
```

### Webhook-уведомления

WATA шлёт webhook при изменении статуса транзакции или подписки. У каждого webhook есть заголовок `X-Signature` - base64 подпись SHA512withRSA по **сырому** телу запроса:

```typescript
import { Controller, Post, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectWata } from '@tsforge7/wata-sdk-nestjs';
import { TRANSACTION_STATUS, Wata, WataWebhookError, WebhookCommand } from '@tsforge7/wata-sdk';

@Controller('wata')
export class WataWebhookController {
    constructor(@InjectWata() private readonly wata: Wata) {}

    @Post('webhook')
    public async handleWebhook(@Req() req: Request, @Res() res: Response) {
        try {
            // req.body должен быть сырым, неразобранным телом (string или Buffer) - см. «Требования» ниже
            const webhook = await this.wata.webhooks.parse(req.body, req.headers['x-signature']);

            if (
                WebhookCommand.isTransactionWebhook(webhook) &&
                webhook.transactionStatus === TRANSACTION_STATUS.Paid
            ) {
                // Зачисляем webhook.orderId идемпотентно - WATA повторяет недоставленные webhook 32 часа
            }

            return res.status(HttpStatus.OK).end();
        } catch (error) {
            if (error instanceof WataWebhookError) {
                return res.status(HttpStatus.UNAUTHORIZED).end();
            }
            throw error;
        }
    }
}
```

Чтобы получить сырое тело в Nest/Express, для этого роута нужен raw body parser (например, `express.raw()`, подключённый до `app.listen()`, либо [`rawBody: true`](https://docs.nestjs.com/faq/raw-body) в `NestFactory.create`) - JSON, который разобрали и собрали обратно, подписи уже не соответствует.

## Обработка ошибок

SDK бросает ошибки в трёх случаях:

```typescript
import { WataApiError } from '@tsforge7/wata-sdk';
import { ZodError } from 'zod';

try {
    await this.wata.api.links.create({/* ... */});
} catch (error) {
    if (error instanceof ZodError) {
        // 1. Ошибка валидации ДО отправки запроса - невалидные параметры
        console.log(error.issues);
    } else if (error instanceof WataApiError) {
        // 2. Ошибка API WATA - не-2xx ответ
        console.log(error.status, error.code, error.message, error.body);
    } else {
        // 3. Сетевая ошибка или таймаут (обычный Error / TypeError)
        throw error;
    }
}
```

| Статус API | Значение                                             |
| ---------- | ---------------------------------------------------- |
| 400        | Ошибка валидации на стороне WATA                     |
| 401        | Неверный или просроченный токен                      |
| 404        | Транзакция/подписка не найдена                       |
| 429        | Превышен лимит частоты запросов (`error.retryAfter`) |

## API модуля

| Экспорт                               | Описание                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `WataNestjsModule.forRoot(options)`   | Синхронная конфигурация. `options.name` регистрирует именованный инстанс вместо дефолтного |
| `WataNestjsModule.forRootAsync(opts)` | Асинхронная конфигурация (`useFactory` / `imports` / `inject`), `name` работает так же     |
| `@InjectWata(name?)`                  | Декоратор для внедрения экземпляра `Wata` - дефолтного или зарегистрированного под `name`  |
| `getWataToken(name?)`                 | DI-токен для инстанса с данным именем, для ручных провайдеров                              |
| `IWataModuleOptions`                  | Тип опций модуля (`token`, `apiUrl?`, `currency?`, `timeout?`, `publicKey?`, `fetch?`)     |

Модуль помечен `@Global()` - подключается один раз в корневом модуле, после чего `@InjectWata()` работает в любом месте приложения без повторных импортов.

## Требования

- Node.js 20+ (SDK использует встроенные `fetch` и `AbortSignal.timeout`)
- NestJS 10+
- TypeScript 5.0+

## Как внести изменения

**Нашли баг?** Создайте [Issue](https://github.com/tsforge/wata-sdk-nestjs/issues/new) - опишите, что делали, что ожидали и что получили (код ошибки, версии модуля, SDK и Node). Никогда не указывайте в issue свой токен и данные реальных транзакций.

**Хотите предложить изменение?** Прямые пуши в репозиторий закрыты - изменения принимаются через Merge Request из форка:

1. **Сделайте форк** репозитория - кнопка «Fork» на странице [tsforge/wata-sdk-nestjs](https://github.com/tsforge/wata-sdk-nestjs).
2. **Склонируйте форк** и создайте ветку:

    ```bash
    git clone git@github.com:<ваш-логин>/wata-sdk-nestjs.git
    cd wata-sdk-nestjs
    npm install
    git checkout -b fix/my-fix
    ```

3. **Внесите изменения** и убедитесь, что всё зелёное:

    ```bash
    npm run lint      # линтер
    npm run build     # сборка
    npm run format    # prettier
    ```

    Комментарии в коде - на английском.

4. **Запушьте ветку в свой форк** и откройте Merge Request в `main` основного репозитория. Опишите, что и зачем изменили; если MR закрывает issue - сошлитесь на него (`Closes #N`).

## Лицензия

ISC © [tsforge](https://github.com/tsforge)
