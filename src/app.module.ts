import { type IncomingMessage } from 'http';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  DB_ENTITIES,
  DB_TYPE,
  DEFAULT_DATABASE_URL,
  getDatabaseSsl,
  shouldSynchronize,
} from './db/db.config';
import { HealthModule } from './health/health.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: { colorize: true, singleLine: true },
              }
            : undefined,
        redact: ['req.headers.authorization', 'req.body.password'],
        serializers: {
          req(req: IncomingMessage & { id: string | number }) {
            return { id: req.id, method: req.method, url: req.url };
          },
        },
      },
    }),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        type: DB_TYPE,
        url: configService.get<string>('DATABASE_URL') ?? DEFAULT_DATABASE_URL,
        ssl: getDatabaseSsl(configService.get<string>('NODE_ENV')),
        entities: DB_ENTITIES,
        synchronize: shouldSynchronize(configService.get<string>('NODE_ENV')),
      }),
      inject: [ConfigService],
    }),
    UserModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
