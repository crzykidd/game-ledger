import { Test, TestingModule } from '@nestjs/testing';
import { VersionController } from './version.controller';
import { VersionService } from './version.service';

describe('VersionController', () => {
  let controller: VersionController;

  const mockVersionService = {
    getVersion: jest.fn().mockReturnValue('1.2.3'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VersionController],
      providers: [{ provide: VersionService, useValue: mockVersionService }],
    }).compile();

    controller = module.get<VersionController>(VersionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /api/version returns { version } from VersionService', () => {
    const result = controller.getVersion();
    expect(result).toEqual({ version: '1.2.3' });
    expect(mockVersionService.getVersion).toHaveBeenCalledTimes(1);
  });

  it('response shape has a "version" string field', () => {
    const result = controller.getVersion();
    expect(typeof result.version).toBe('string');
  });
});
