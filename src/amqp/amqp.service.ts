import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ScannerService } from "@quickts/nestjs-scanner";
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
        private readonly scannerService: ScannerService, //
        @Inject(AMQP_OPTION) private readonly options: Options.Connect
    ) {}

    async onModuleInit() {
        this.logger.log("Initializing...");
        this.connection = await connect(this.options);
        this.connection.once("close", this.onConnectionClose.bind(this));
        this.connection.on("error", err => this.logger.error(err));

        const consumerMetadates: any[] = [];
        await this.scannerService.scanProviderMethodMetadates(AMQP_CONSUMER_METADATA, async (instance, methodName, metadata) => {
            consumerMetadates.push({ instance, methodName, metadata });
        });
        const publisherMetadates: any[] = [];
        await this.scannerService.scanProviderPropertyMetadates(AMQP_PUBLISHER_METADATA, async (instance, propertyKey, metadata) => {
            publisherMetadates.push({ instance, propertyKey, metadata });
        });
        for (const { instance, propertyKey, metadata } of publisherMetadates) {
            const exchangeMetadate = metadata;
            const encode = exchangeMetadate.encode || defaultEncode;
            const channel = await this.connection.createChannel();
            await channel.assertExchange(exchangeMetadate.exchange, exchangeMetadate.type || "direct", exchangeMetadate.exchangeOptions);
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
        await this.scannerService.scanProvider(async instance => {
            if (instance["afterPublisherInit"]) {
                await instance["afterPublisherInit"]();
            }
        });
        for (const { instance, methodName, metadata } of consumerMetadates) {
            const exchangeMetadate = metadata.exchangeMetadate;
            const queueMetadate = metadata.queueMetadate;
            const patternsMetadate = metadata.patternsMetadate;
            const decode = queueMetadate.decode || defaultDecode;
            const channel = await this.connection.createChannel();
            await channel.assertExchange(exchangeMetadate.exchange, exchangeMetadate.type || "direct", exchangeMetadate.exchangeOptions);
            const queue = await channel.assertQueue(queueMetadate.queue, queueMetadate.queueOptions);
            if (exchangeMetadate.type != "fanout") {
                if (patternsMetadate.length) {
                    for (const pattern of patternsMetadate) {
                        await channel.bindQueue(queue.queue, exchangeMetadate.exchange, pattern);
                    }
                } else {
                    await channel.bindQueue(queue.queue, exchangeMetadate.exchange, queueMetadate.queue);
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
        if (this.connection) {
            await this.connection.close();
            this.connection = null;
        }
    }

    getConnection() {
        return this.connection;
    }
}
