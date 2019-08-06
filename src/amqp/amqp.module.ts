import { Module, DynamicModule } from "@nestjs/common";
import { NacosNamingOptions } from "./amqp.interface";
import { createProvider } from "./amqp.provider";
import { NacosNamingClient } from "./amqp.service";

@Module({})
export class NacosNamingModule {
    static forRoot(options: NacosNamingOptions): DynamicModule {
        const provider = createProvider(options);
        return {
            module: NacosNamingModule,
            providers: [provider, NacosNamingClient],
            exports: [NacosNamingClient]
        };
    }
}
