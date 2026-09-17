import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

const mockHealthService = {
  isHealthy: jest.fn(),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('healthCheck', () => {
    it('returns { status: "healthy" } when the service reports healthy', async () => {
      mockHealthService.isHealthy.mockResolvedValue(true);

      const result = await controller.healthCheck();

      expect(mockHealthService.isHealthy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ status: 'healthy' });
    });

    it('throws a 503 ServiceUnavailableException when the service reports unhealthy', async () => {
      mockHealthService.isHealthy.mockResolvedValue(false);

      const result = controller.healthCheck();

      await expect(result).rejects.toThrow(ServiceUnavailableException);
      await expect(result).rejects.toMatchObject({ status: 503 });
    });
  });
});
