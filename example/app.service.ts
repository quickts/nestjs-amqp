import { Injectable } from "@nestjs/common";
import { Publish, Consume, Publisher } from "../src";
@Injectable()
export class AppService {
    @Publish({ exchange: "events.test", confirm: true })
    publisher: Publisher;

    constructor() {}

    @Consume("events.test", {
        queue: "events.test.queue",
        nackOptions: { requeue: false }
    })
    onTestEvent(data: string) {
        console.log("Get event:", data);
    }

    async getHello() {
        this.publisher("fuck you!");
        return {
            hello: "Hello World!"
        };
    }
    //
}
