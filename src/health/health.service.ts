import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  constructor() {}
  isHealthy(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
