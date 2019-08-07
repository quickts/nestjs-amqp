import { Module, DynamicModule } from "@nestjs/common";
import { Options } from "./amqp.interface";
import { createProvider } from "./amqp.provider";
import { AmqpService } from "./amqp.service";

@Module({})
export class AmqpModule {
    static forRoot(options: Options.Connect): DynamicModule {
        const provider = createProvider(options);
        return {
            module: AmqpModule,
            providers: [provider, AmqpService],
            exports: [AmqpService]
        };
    }
}
