import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AmqpModule } from "../src";

@Module({
    imports: [AmqpModule.forRoot({})],
    controllers: [AppController],
    providers: [AppService]
})
export class AppModule {}
