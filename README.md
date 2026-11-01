# WATA SDK for NestJS

**English** | [Русский](./README.ru.md)

## Installation

```bash
npm install @tsforge7/wata-sdk-nestjs @tsforge7/wata-sdk
```

![npm version](https://img.shields.io/npm/v/@tsforge7/wata-sdk-nestjs)
![License](https://img.shields.io/npm/l/@tsforge7/wata-sdk-nestjs)
![Build Status](https://img.shields.io/github/actions/workflow/status/tsforge/wata-sdk-nestjs/ci.yml)

NestJS module for the [WATA](https://wata.pro) acquiring API: payment links, H2H payments by card/SBP/T-Pay, refunds, subscriptions, balance and webhook signature verification.

This is a wrapper around [@tsforge7/wata-sdk](https://github.com/tsforge/wata-sdk) - it registers a ready-to-use `Wata` instance in the NestJS DI container and provides the `@InjectWata()` decorator for injecting it into your services.

📖 [Official WATA documentation](https://api.wata.pro) · [SDK documentation](https://github.com/tsforge/wata-sdk)

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration](#configuration)
    - [Synchronous - `forRoot()`](#synchronous---forroot)
    - [Asynchronous - `forRootAsync()`](#asynchronous---forrootasync)
    - [Multiple instances](#multiple-instances)
- [What the SDK can do](#what-the-sdk-can-do)
- [Examples](#examples)
    - [Service](#service)
    - [CQRS handler](#cqrs-handler)
    - [Webhooks](#webhooks)
- [Error handling](#error-handling)
- [Module API](#module-api)
- [Requirements](#requirements)
- [Contributing](#contributing)
- [License](#license)

---

## Quick start

**1. Import the module** - it is global, a single import in `AppModule` is enough:

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

**2. Inject the SDK and create a payment link:**

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
            orderId, // your order number: WATA returns it in the webhook
            description: `Order #${orderId}`,
            successRedirectUrl: 'https://myshop.com/success',
            failRedirectUrl: 'https://myshop.com/fail',
        });

        // link.url - redirect the customer to this link
        return link;
    }
}
```

**3. Next:** the customer pays → WATA sends a [webhook](#webhooks) → you credit the order.

## Configuration

| Parameter   | Required | Description                                                                                       |
| ----------- | -------- | ------------------------------------------------------------------------------------------------- |
| `token`     | yes      | Bearer access token (JWT) of the terminal, from the merchant dashboard                            |
| `apiUrl`    | no       | API URL, defaults to `https://api.wata.pro/api/h2h/`                                              |
| `currency`  | no       | Default currency for payment links and card payments: `RUB` (default), `USD`, `EUR`, `GBP`, `BYN` |
| `timeout`   | no       | Request timeout in ms, defaults to `60000`                                                        |
| `publicKey` | no       | Webhook public key in PEM. Without it, the key is loaded from the API and cached                  |
| `fetch`     | no       | Custom `fetch` implementation, e.g. `undici` with a proxy agent                                   |

The token is issued by your WATA manager and is also available in the merchant dashboard under **Terminals**. The config is validated at application startup: a missing or malformed token fails immediately with a clear error, not on the first request.

> ⚠️ **Never commit the token to git.** The SDK runs on the server only - keep the token in an environment variable, it gives full access to the terminal.

### Synchronous - `forRoot()`

Use it when the token is available at module load time:

```typescript
WataNestjsModule.forRoot({
    token: process.env.WATA_TOKEN!,
});
```

### Asynchronous - `forRootAsync()`

Use it when the token comes from `ConfigService` or another provider:

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

### Multiple instances

Call `forRoot()` / `forRootAsync()` more than once with a different `name` to register several independent `Wata` instances - e.g. several WATA terminals in one app. Without `name` you get the default instance, exactly as above.

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

`name` works the same way for `forRootAsync()`. The module stays `@Global()`, so named instances are available anywhere in the app without re-importing.

## What the SDK can do

The injected `Wata` instance gives access to the REST API (`wata.api`) and to webhooks (`wata.webhooks`):

| What you need to do                     | Method                                     |
| --------------------------------------- | ------------------------------------------ |
| Payment link (payer chooses the method) | `wata.api.links.create()`                  |
| Payment link status / search            | `wata.api.links.get()` / `.find()`         |
| H2H payment by card                     | `wata.api.payments.card()`                 |
| H2H payment by SBP                      | `wata.api.payments.sbp()`                  |
| H2H payment by T-Pay                    | `wata.api.payments.tPay()`                 |
| Transaction status / search             | `wata.api.transactions.get()` / `.find()`  |
| Refund a payment                        | `wata.api.transactions.refund()`           |
| Subscription status / search            | `wata.api.subscriptions.get()` / `.find()` |
| Stop a subscription                     | `wata.api.subscriptions.complete()`        |
| Balance for a given day                 | `wata.api.finance.balance()`               |
| Webhook public key                      | `wata.api.publicKey.get()`                 |
| Verify and parse a webhook              | `wata.webhooks.parse()` / `.verify()`      |

Constants (`CURRENCY`, `TRANSACTION_STATUS`, `PAYMENT_LINK_STATUS`, `ERROR_CODE`...), zod schemas and all request/response types are exported from the root of `@tsforge7/wata-sdk` - no deep imports needed. Full reference - in the [SDK documentation](https://github.com/tsforge/wata-sdk).

## Examples

### Service

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
            description: `Order #${orderId}`,
            successRedirectUrl: 'https://myshop.com/success',
            failRedirectUrl: 'https://myshop.com/fail',
        });
    }

    // Status check
    public async getStatus(transactionId: string) {
        const transaction = await this.wata.api.transactions.get(transactionId);
        return transaction.transactionStatus; // 'Created' | 'Pending' | 'Paid' | 'Declined'
    }
}
```

### CQRS handler

Example for projects using `@nestjs/cqrs`:

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
                orderId: uuid, // comes back in the webhook
                description: `Order #${uuid}`,
                successRedirectUrl: 'https://myshop.com/success',
                failRedirectUrl: 'https://myshop.com/fail',
            });

            return {
                isSuccess: true,
                data: link, // link.url, link.id
            };
        } catch (error: unknown) {
            // Invalid params - the SDK rejected the request BEFORE sending (amount, required fields...)
            if (error instanceof ZodError) {
                this.logger.error(
                    `[CreatePaymentLinkHandler] Invalid payment params: ${JSON.stringify(error.issues)}`,
                );
                return {
                    isSuccess: false,
                    ...ERRORS.CREATE_PAYMENT_LINK_INVALID_PARAMS,
                };
            }

            // WATA API error: non-2xx response
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

### Webhooks

WATA sends a webhook when a transaction or a subscription changes. Every webhook has the `X-Signature` header - a base64 SHA512withRSA signature of the **raw** request body:

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
            // req.body must be the raw, unparsed body (string or Buffer) - see "Requirements" below
            const webhook = await this.wata.webhooks.parse(req.body, req.headers['x-signature']);

            if (
                WebhookCommand.isTransactionWebhook(webhook) &&
                webhook.transactionStatus === TRANSACTION_STATUS.Paid
            ) {
                // Credit webhook.orderId idempotently - WATA retries undelivered webhooks for 32 hours
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

Getting the raw body in Nest/Express requires a raw body parser for this route (e.g. `express.raw()` mounted before `app.listen()`, or [`rawBody: true`](https://docs.nestjs.com/faq/raw-body) in `NestFactory.create`) - JSON that was parsed and serialized again no longer matches the signature.

## Error handling

The SDK throws errors in three cases:

```typescript
import { WataApiError } from '@tsforge7/wata-sdk';
import { ZodError } from 'zod';

try {
    await this.wata.api.links.create({/* ... */});
} catch (error) {
    if (error instanceof ZodError) {
        // 1. Validation error BEFORE the request is sent - invalid parameters
        console.log(error.issues);
    } else if (error instanceof WataApiError) {
        // 2. WATA API error - non-2xx response
        console.log(error.status, error.code, error.message, error.body);
    } else {
        // 3. Network failure or timeout (plain Error / TypeError)
        throw error;
    }
}
```

| API status | Meaning                                  |
| ---------- | ---------------------------------------- |
| 400        | Validation error on the WATA side        |
| 401        | Invalid or expired token                 |
| 404        | Transaction/subscription not found       |
| 429        | Rate limit exceeded (`error.retryAfter`) |

## Module API

| Export                                | Description                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `WataNestjsModule.forRoot(options)`   | Synchronous configuration. `options.name` registers a named instance instead of the default |
| `WataNestjsModule.forRootAsync(opts)` | Asynchronous configuration (`useFactory` / `imports` / `inject`), `name` works the same way |
| `@InjectWata(name?)`                  | Decorator that injects the `Wata` instance - default, or the one registered under `name`    |
| `getWataToken(name?)`                 | DI token for a given instance name, for manual providers                                    |
| `IWataModuleOptions`                  | Module options type (`token`, `apiUrl?`, `currency?`, `timeout?`, `publicKey?`, `fetch?`)   |

The module is marked `@Global()` - import it once in the root module, after that `@InjectWata()` works anywhere in the application without re-imports.

## Requirements

- Node.js 20+ (the SDK uses the built-in `fetch` and `AbortSignal.timeout`)
- NestJS 10+
- TypeScript 5.0+

## Contributing

**Found a bug?** Open an [Issue](https://github.com/tsforge/wata-sdk-nestjs/issues/new) - describe what you did, what you expected and what you got (error code, module, SDK and Node versions). Please never include your token or real transaction data in an issue.

**Want to propose a change?** Direct pushes to the repository are not allowed - changes are accepted via a Merge Request from a fork:

1. **Fork** the repository - the "Fork" button on the [tsforge/wata-sdk-nestjs](https://github.com/tsforge/wata-sdk-nestjs) page.
2. **Clone your fork** and create a branch:

    ```bash
    git clone git@github.com:<your-login>/wata-sdk-nestjs.git
    cd wata-sdk-nestjs
    npm install
    git checkout -b fix/my-fix
    ```

3. **Make your changes** and make sure everything is green:

    ```bash
    npm run lint      # linter
    npm run build     # build
    npm run format    # prettier
    ```

    Keep code comments in English.

4. **Push the branch to your fork** and open a Merge Request into `main` of the upstream repository. Describe what you changed and why; if the MR closes an issue, reference it (`Closes #N`).

## License

ISC © [tsforge](https://github.com/tsforge)
