import { Module, DynamicModule, Global } from "@nestjs/common";
import { ScannerModule } from "@quickts/nestjs-scanner";
import { Options } from "amqplib";
import { createProvider } from "./amqp.provider";
import { AmqpService } from "./amqp.service";

@Module({})
export class AmqpModule {
    static forRoot(options: Options.Connect): DynamicModule {
        const provider = createProvider(options);
        return {
            module: AmqpModule,
            imports: [ScannerModule.forRoot(false)],
            providers: [provider, AmqpService],
            exports: [AmqpService]
        };
    }
}

@Global()
@Module({})
export class AmqpGlobalModule {
    static forRoot(options: Options.Connect): DynamicModule {
        const provider = createProvider(options);
        return {
            module: AmqpModule,
            imports: [ScannerModule.forRoot(true)],
            providers: [provider, AmqpService],
            exports: [AmqpService]
        };
    }
}
