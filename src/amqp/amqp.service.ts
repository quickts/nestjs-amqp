import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ModulesContainer } from "@nestjs/core/injector/modules-container";
import { isFunction, isConstructor } from "@nestjs/common/utils/shared.utils";
import { connect, Connection, Options } from "amqplib";
import { AMQP_OPTION, AMQP_CONSUMER_METADATA, AMQP_PUBLISHER_METADATA } from "./amqp.constants";

function defaultEncode(msg: any) {
    return Buffer.from(JSON.stringify(msg));
}

function defaultDecode(data: Buffer) {
    return JSON.parse(data.toString());
}

@Injectable()
export class AmqpService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger("AmqpService");
    private needReconnect = true;
    private reconnectTimer: NodeJS.Timeout;
    private connection: Connection;
    constructor(
        private readonly modulesContainer: ModulesContainer, //
        @Inject(AMQP_OPTION) private readonly options: Options.Connect
    ) {}

    private scanInstances(cb: (instance: any) => void) {
        this.modulesContainer.forEach(({ controllers, providers }) => {
            controllers.forEach(({ instance }) => {
                if (instance && typeof instance === "object") {
                    cb(instance);
                }
            });
            providers.forEach(({ instance }) => {
                if (instance && typeof instance === "object") {
                    cb(instance);
                }
            });
        });
    }

    private scanPropertyMetadates(metaKey: any, cb: (instance: any, propertyKey: string, metadata: any) => void) {
        this.scanInstances((instance: any) => {
            for (const propertyKey in instance) {
                const metadata = Reflect.getMetadata(metaKey, instance, propertyKey);
                if (metadata) {
                    cb(instance, propertyKey, metadata);
                }
            }
        });
    }

    private getMethodNames(prototype: any) {
        const methodNames = Object.getOwnPropertyNames(prototype).filter(prop => {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, prop) as PropertyDescriptor;
            if (descriptor.set || descriptor.get) {
                return false;
            }
            return !isConstructor(prop) && isFunction(prototype[prop]);
        });
        return methodNames;
    }

    private scanMethodMetadates(metaKey: any, cb: (instance: any, propertyKey: string, metadata: any) => void) {
        this.scanInstances((instance: any) => {
            const prototype = Object.getPrototypeOf(instance);
            const methodNames = this.getMethodNames(prototype);
            for (const methodName of methodNames) {
                const targetCallback = prototype[methodName];
                const metadata = Reflect.getMetadata(metaKey, targetCallback);
                if (metadata) {
                    cb(instance, methodName, metadata);
                }
            }
        });
    }

    async onModuleInit() {
        this.logger.log("Initializing...");
        this.connection = await connect(this.options);
        this.connection.once("close", this.onConnectionClose.bind(this));
        this.connection.on("error", err => this.logger.error(err));
        const consumerMetadates: any[] = [];
        this.scanMethodMetadates(AMQP_CONSUMER_METADATA, (instance, methodName, metadata) => {
            consumerMetadates.push({ instance, methodName, metadata });
        });
        const publisherMetadates: any[] = [];
        this.scanPropertyMetadates(AMQP_PUBLISHER_METADATA, (instance, propertyKey, metadata) => {
            publisherMetadates.push({ instance, propertyKey, metadata });
        });
        for (const { instance, propertyKey, metadata } of publisherMetadates) {
            const exchangeMetadate = metadata;
            const encode = exchangeMetadate.encode || defaultEncode;
            const channel = await this.connection.createChannel();
            await channel.assertExchange(exchangeMetadate.exchange, exchangeMetadate.type || "fanout", exchangeMetadate.exchangeOptions);
            instance[propertyKey] = (msg: any, routingKey?: string, publishOptions?: Options.Publish) => {
                return channel.publish(
                    exchangeMetadate.exchange, //
                    routingKey || "",
                    encode(msg),
                    publishOptions || exchangeMetadate.publishOptions
                );
            };
            this.logger.log(`[Publisher exchange:${exchangeMetadate.exchange}] initialized`);
        }
        for (const { instance, methodName, metadata } of consumerMetadates) {
            const exchangeMetadate = metadata.exchangeMetadate;
            const queueMetadate = metadata.queueMetadate;
            const patternsMetadate = metadata.patternsMetadate;
            const decode = queueMetadate.decode || defaultDecode;
            const channel = await this.connection.createChannel();
            await channel.assertExchange(exchangeMetadate.exchange, exchangeMetadate.type || "fanout", exchangeMetadate.exchangeOptions);
            const queue = await channel.assertQueue(queueMetadate.queue, queueMetadate.queueOptions);
            if (exchangeMetadate.type && exchangeMetadate.type != "fanout") {
                for (const pattern of patternsMetadate) {
                    await channel.bindQueue(queue.queue, exchangeMetadate.exchange, pattern);
                }
            } else {
                await channel.bindQueue(queue.queue, exchangeMetadate.exchange, "");
            }
            const needAck = !queueMetadate.consumeOptions || !queueMetadate.consumeOptions.noAck;
            const nackOptions = queueMetadate.nackOptions || {};
            await channel.consume(
                queue.queue,
                async msg => {
                    try {
                        if (msg) {
                            await instance[methodName](decode(msg.content), msg.fields, msg.properties);
                            needAck && channel.ack(msg);
                        }
                    } catch (err) {
                        needAck && channel.nack(msg, nackOptions.allUpTo, nackOptions.requeue);
                        this.logger.error(err);
                    }
                },
                queueMetadate.consumeOptions
            );

            this.logger.log(`[Consume exchange:${exchangeMetadate.exchange} queue:${queue.queue}] initialized`);
        }
    }

    onConnectionClose(err) {
        if (this.needReconnect) {
            this.logger.error(err);
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = undefined;
                this.onModuleInit().catch(err => {
                    this.logger.error(err);
                });
            }, 1000);
        }
    }

    async onModuleDestroy() {
        this.needReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        await this.connection.close();
    }
}
