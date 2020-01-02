import { Options } from "amqplib";

export interface Publisher {
    (msg: any, routingKey?: string, publishOptions?: Options.Publish, confirmCallback?: (err: any) => void): boolean;
}

export interface AfterPublisherInit {
    afterPublisherInit(): any;
}
