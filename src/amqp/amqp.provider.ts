import { Provider } from "@nestjs/common";
import { NacosNamingOptions } from "./amqp.interface";
import { NACOS_NAMING_OPTION } from "./amqp.constants";

export function createProvider(nacosNamingOptions: NacosNamingOptions): Provider<NacosNamingOptions> {
    return {
        provide: NACOS_NAMING_OPTION,
        useValue: nacosNamingOptions
    };
}
