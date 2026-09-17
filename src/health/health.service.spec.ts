import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { getLoggerToken } from 'nestjs-pino';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  const mockDataSource = {
    query: jest.fn(),
  };
  const mockLogger = {
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: getLoggerToken(HealthService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isHealthy', () => {
    it('returns a Promise', () => {
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      expect(service.isHealthy()).toBeInstanceOf(Promise);
    });

    it('resolves to true when the database ping succeeds', async () => {
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);

      const result = await service.isHealthy();

      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
      expect(result).toBe(true);
    });

    it('resolves to false when the database connection rejects', async () => {
      mockDataSource.query.mockRejectedValue(new Error('connection refused'));

      const result = await service.isHealthy();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });
  });
});
