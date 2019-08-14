import { Options } from "amqplib";

export interface Publisher {
    (msg: any, routingKey?: string, publishOptions?: Options.Publish): boolean;
}

export interface AfterPublisherInit {
    afterPublisherInit(): any;
}
