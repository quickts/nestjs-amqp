import { Provider } from "@nestjs/common";
import { Options } from "./amqp.interface";
import { AMQP_OPTION } from "./amqp.constants";

export function createProvider(amqpOptions: Options.Connect): Provider<Options.Connect> {
    return {
        provide: AMQP_OPTION,
        useValue: amqpOptions
    };
}
