import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}
  @Get()
  async healthCheck() {
    if (!(await this.healthService.isHealthy())) {
      throw new ServiceUnavailableException({ status: 'unhealthy' });
    }
    return { status: 'healthy' };
  }
}
