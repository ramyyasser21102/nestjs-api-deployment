import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isHealthy', () => {
    it('returns a Promise', () => {
      expect(service.isHealthy()).toBeInstanceOf(Promise);
    });

    it('resolves to true', async () => {
      const result = await service.isHealthy();
      expect(result).toBe(true);
    });
  });
});
