import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GamesService } from './games.service';
import { CreateGameDto, PostEventDto } from './games.dto';
import { AuthGuard } from '../rbac/auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { CurrentUser } from '../rbac/current-user.decorator';
import { User } from '@prisma/client';

@Controller('games')
@UseGuards(AuthGuard, PermissionsGuard)
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  /** POST /api/games — start a new game */
  @Post()
  @UseGuards(CsrfGuard)
  createGame(@Body() dto: CreateGameDto, @CurrentUser() user: User) {
    return this.gamesService.createGame(dto, user.id);
  }

  /** GET /api/games — caller's games */
  @Get()
  listGames(@CurrentUser() user: User) {
    return this.gamesService.listGames(user.id);
  }

  /** GET /api/games/:id — game detail + current state + version */
  @Get(':id')
  getGame(@Param('id') id: string) {
    return this.gamesService.getGame(id);
  }

  /** POST /api/games/:id/events — append event */
  @Post(':id/events')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  postEvent(@Param('id') id: string, @Body() dto: PostEventDto, @CurrentUser() user: User) {
    return this.gamesService.postEvent(id, dto, user.id);
  }

  /** GET /api/games/:id/events — ordered event log */
  @Get(':id/events')
  getEvents(@Param('id') id: string) {
    return this.gamesService.getEvents(id);
  }

  /** POST /api/games/:id/finish — finalize scoring */
  @Post(':id/finish')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  finishGame(@Param('id') id: string, @CurrentUser() user: User) {
    return this.gamesService.finishGame(id, user.id);
  }

  /** POST /api/games/:id/cancel — abandon an active game (creator-only) */
  @Post(':id/cancel')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  cancelGame(@Param('id') id: string, @CurrentUser() user: User) {
    return this.gamesService.cancelGame(id, user.id);
  }

  /** DELETE /api/games/:id — hard-delete a game and all child rows (creator-only) */
  @Delete(':id')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  deleteGame(@Param('id') id: string, @CurrentUser() user: User) {
    return this.gamesService.deleteGame(id, user.id);
  }

  /** POST /api/games/:id/undo-last-round — revert the last round (creator-only) */
  @Post(':id/undo-last-round')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  undoLastRound(@Param('id') id: string, @CurrentUser() user: User) {
    return this.gamesService.undoLastRound(id, user.id);
  }
}
