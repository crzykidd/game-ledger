import { Module } from '@nestjs/common';
import { PlayersService } from './players.service';
import { PlayersController, PlaygroupsController } from './players.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [PlayersController, PlaygroupsController],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
