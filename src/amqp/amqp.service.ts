import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { connect, Connection, Options } from "amqplib";
import { AMQP_OPTION } from "./amqp.constants";
import { NacosNamingOptions } from "./amqp.interface";

@Injectable()
export class AmqpService implements OnModuleInit, OnModuleDestroy {
    private connection: Connection;
    constructor(@Inject(AMQP_OPTION) private readonly options: Options.Connect) {}

    async onModuleInit() {
        this.connection = await connect(this.options);
        const channel = await this.connection.createChannel();
        await channel.assertExchange("e", "fanout");
        const q = channel.assertQueue("q", {});
        channel.bindQueue("e", "q", "");
    }

    async onModuleDestroy() {
        await this.connection.close();
    }

    // getAllInstances(serviceName: string, groupName?: string, clusters?: string, subscribe?: boolean) {
    //     return super.getAllInstances(serviceName, groupName, clusters, subscribe) as Promise<NacosInstance[]>;
    // }

    // selectInstances(serviceName: string, groupName?: string, clusters?: string, healthy?: boolean, subscribe?: boolean) {
    //     return super.selectInstances(serviceName, groupName, clusters, healthy, subscribe) as Promise<NacosInstance[]>;
    // }

    // getServerStatus() {
    //     return super.getServerStatus() as Promise<"UP" | "DOWN">;
    // }

    // subscribe(info: string | { serviceName: string; groupName?: string; clusters?: string }, listener: (instances: NacosInstance[]) => void) {
    //     super.subscribe(info, listener);
    // }

    // unSubscribe(info: string | { serviceName: string; groupName?: string; clusters?: string }, listener: (instances: NacosInstance[]) => void) {
    //     super.unSubscribe(info, listener);
    // }

    async selectOneHealthyInstance(serviceName: string, groupName?: string, clusters?: string) {
        const instances = await this.selectInstances(serviceName, groupName, clusters, true);
        let totalWeight = 0;
        for (const instance of instances) {
            totalWeight += instance.weight;
        }
        let pos = Math.random() * totalWeight;
        for (const instance of instances) {
            if (instance.weight) {
                pos -= instance.weight;
                if (pos <= 0) {
                    return instance;
                }
            }
        }
        throw new Error(`Not found service ${serviceName}!`);
    }
}
