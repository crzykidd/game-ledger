import { Module } from '@nestjs/common';
import { ModuleLoaderService } from './module-loader.service';
import { ModuleLoaderController } from './module-loader.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [ModuleLoaderController],
  providers: [ModuleLoaderService],
  exports: [ModuleLoaderService],
})
export class ModuleLoaderModule {}
