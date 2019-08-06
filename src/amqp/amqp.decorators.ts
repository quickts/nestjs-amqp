import { Options } from "amqplib";
import { AMQP_PUBLISHER_METADATA, AMQP_CONSUMER_METADATA } from "./amqp.constants";

export function Publisher(
    exchange:
        | string
        | {
              exchange: string;
              type?: string;
              exchangeOptions?: Options.AssertExchange;
              encode?: Function;
          }
) {
    return (target: any, propertyKey: string | symbol) => {
        Reflect.set(target, propertyKey, null);
        const exchangeMetadate = typeof exchange === "string" ? { exchange: exchange } : exchange;
        Reflect.defineMetadata(AMQP_PUBLISHER_METADATA, exchangeMetadate, target, propertyKey);
    };
}

export function Consumer(
    exchange:
        | string
        | {
              exchange: string;
              type?: string;
              exchangeOptions?: Options.AssertExchange;
          },
    queue:
        | string
        | {
              queue: string;
              assertOptions?: Options.AssertQueue;
              consumeOptions?: Options.Consume;
              decode?: Function;
          },
    keys?: string[]
) {
    return (target: any, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<any>) => {
        const exchangeMetadate = typeof exchange === "string" ? { exchange: exchange, type: "fanout" } : exchange;
        const queueMetadate = typeof queue === "string" ? { queue: queue } : queue;
        const keysMetadate = keys || [];
        Reflect.defineMetadata(AMQP_CONSUMER_METADATA, { exchangeMetadate, queueMetadate, keysMetadate }, target, propertyKey);
    };
}
