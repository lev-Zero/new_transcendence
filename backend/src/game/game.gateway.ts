import { Body, HttpException, HttpStatus } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthService } from 'src/auth/service/auth.service';
import { User } from 'src/user/entity/user.entity';
import { userStatus } from 'src/user/enum/status.enum';
import { UserService } from 'src/user/service/user.service';
import {
  GamePlayerDto,
  GameRoomNameDto,
  InviteGameRoomInfoDto,
  InviteUserDto,
  ReadyGameOptionDto,
  ResponseInviteDto,
  TouchBarDto,
} from './dto/game.dto';
import { gameStatus, PlayerType } from './enum/game.enum';
import { GameService } from './game.service';

const socket_username = {};

@WebSocketGateway({ namespace: 'game', cors: true })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly gameService: GameService,
  ) {}

  @WebSocketServer()
  public server: any;

  /* --------------------------
	|				handleConnection 		|
	|				handleDisconnect		|
	---------------------------*/

  async handleConnection(socket: Socket) {
    try {
      const user = await this.authService.findUserByRequestToken(socket);
      if (!user) {
        socket.disconnect();
        throw new HttpException(
          '소켓 연결 유저 없습니다.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // await this.userService.updateStatus(user.id, userStatus.GAMECHANNEL);
      await this.userService.updateStatus(user.id, userStatus.INGAME);

      socket.data.user = user;
      socket_username[user.username] = socket;

      socket.emit('connection', { message: `${user.username} 연결`, user });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
  async handleDisconnect(socket: Socket) {
    try {
      const user = socket.data.user;
      if (!user)
        throw new HttpException(
          '소켓 연결 유저 없습니다.',
          HttpStatus.BAD_REQUEST,
        );

      const gameRoomName = this.gameService.findGameRoomOfUser(user.id);
      if (gameRoomName) await this.exitGameRoom(socket, { gameRoomName });

      await this.userService.updateStatus(user.id, userStatus.ONLINE);

      socket.emit('disconnection', { message: `${user.username} 연결해제` });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /* --------------------------
	|				findGameRooms 		|
	---------------------------*/

  @SubscribeMessage('findGameRooms')
  findGameRooms(socket: Socket): void {
    try {
      const gameRooms = this.gameService.findGameRooms();

      const result = [];

      for (const gameroomKey of gameRooms.keys()) {
        result.push(gameRooms.get(gameroomKey));
      }

      socket.emit('findGameRooms', { gameRoom: result });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /* --------------------------
	|				createGameRoom 		|
	|				joinGameRoom		|
	|				readyGame		|
	|				startGame		|
	|				exitGameRoom		|
	---------------------------*/

  @SubscribeMessage('createGameRoom')
  createGameRoom(socket: Socket): void {
    try {
      const user = socket.data.user;
      if (!user)
        throw new HttpException(
          '소켓 연결 유저 없습니다.',
          HttpStatus.BAD_REQUEST,
        );

      const randomRoomName = String(Math.floor(Math.random() * 1e9));

      let gameRoom = this.gameService.findGameRoom(randomRoomName);
      if (gameRoom)
        throw new HttpException(
          '이미 존재하는 게임룸 입니다',
          HttpStatus.BAD_REQUEST,
        );

      gameRoom = this.gameService.createGameRoom(randomRoomName);
      if (!gameRoom)
        throw new HttpException(
          '게임룸 생성 실패했습니다.',
          HttpStatus.BAD_REQUEST,
        );

      socket.emit('createGameRoom', {
        message: `${randomRoomName} 게임룸이 생성되었습니다.`,
        gameRoom,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @SubscribeMessage('joinGameRoom')
  async joinGameRoom(
    socket: Socket,
    @Body() body: GameRoomNameDto,
  ): Promise<void> {
    try {
      const user: User = socket.data.user;
      if (!user)
        throw new HttpException(
          '소켓 연결 유저 없습니다.',
          HttpStatus.BAD_REQUEST,
        );

      const gameRoom = this.gameService.findGameRoom(body.gameRoomName);
      if (!gameRoom)
        throw new HttpException(
          '존재하지 않는 게임룸 입니다',
          HttpStatus.BAD_REQUEST,
        );

      for (const player of gameRoom.players) {
        if (player.user.username == socket.data.user.username)
          throw new HttpException(
            '이미 참여중인 게임룸입니다.',
            HttpStatus.BAD_REQUEST,
          );
      }

      const result = this.gameService.joinGameRoom(socket, gameRoom);
      socket.join(result.gameRoom.gameRoomName);

      if (result.user == PlayerType.PLAYER) {
        this.server.to(gameRoom.gameRoomName).emit('joinGameRoom', {
          message: `${body.gameRoomName} 게임룸에 ${user.username} 플레이어가 들어왔습니다.`,
          gameRoom,
        });
      } else if (result.user == PlayerType.SPECTATOR) {
        this.server.to(gameRoom.gameRoomName).emit('joinGameRoom', {
          message: `${body.gameRoomName} 게임룸에 ${user.username} 관찰자가 들어왔습니다.`,
          gameRoom,
        });
      } else {
        throw new HttpException(
          'PlayerType이 정의되지 않은 유저 입니다.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // await this.userService.updateStatus(user.id, userStatus.GAMEROOM);
      await this.userService.updateStatus(user.id, userStatus.INGAME);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @SubscribeMessage('readyGame')
  readyGame(socket: Socket, @Body() body: ReadyGameOptionDto): void {
    try {
      const user = socket.data.user;
      if (!user)
        throw new HttpException(
          '소켓 연결 유저 없습니다.',
          HttpStatus.BAD_REQUEST,
        );
      const player = this.gameService.findPlayerInGameRoom(
        user.id,
        body.gameRoomName,
      );
      if (!player)
        throw new HttpException(
          `${body.gameRoomName}에 해당 플레이어가 없습니다.`,
          HttpStatus.BAD_REQUEST,
        );

      const gameRoom = this.gameService.readyGame(
        body.gameRoomName,
        player,
        body.gameOption,
      );

      if (!gameRoom) {
        this.server
          .to(body.gameRoomName)
          .emit('wait', { message: `다른 유저를 기다리는 중입니다.` });
      } else {
        this.server.to(gameRoom.gameRoomName).emit('readyGame', {
          message: `양 쪽 유저 게임 준비 완료`,
          gameRoomOptions: gameRoom.facts,
          players: gameRoom.players.map((player) => player.user),
        });
      }
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @SubscribeMessage('startGame')
  async startGame(
    socket: Socket,
    @Body() body: GameRoomNameDto,
  ): Promise<void> {
    try {
      const user = socket.data.user;
      if (!user)
        throw new HttpException(
          '소켓 연결 유저 없습니다.',
          HttpStatus.BAD_REQUEST,
        );

      const player = this.gameService.findPlayerInGameRoom(
        user.id,
        body.gameRoomName,
      );
      if (!player)
        throw new HttpException(
          `${body.gameRoomName}에 해당 플레이어는 없습니다.`,
          HttpStatus.BAD_REQUEST,
        );

      const gameRoom = this.gameService.findGameRoom(player.gameRoomName);
      if (!gameRoom)
        throw new HttpException(
          '존재하지 않는 게임룸 입니다',
          HttpStatus.BAD_REQUEST,
        );

      let ballPosition;
      if (gameRoom.gameStatus == gameStatus.COUNTDOWN) {
        ballPosition = this.gameService.resetBallPosition(gameRoom);
        gameRoom.gameStatus = gameStatus.GAMEPLAYING;
      } else {
      }

      if (!ballPosition)
        throw new HttpException(
          '게임 시작 전 공셋팅에 실패했습니다.',
          HttpStatus.BAD_REQUEST,
        );

      this.server
        .to(gameRoom.gameRoomName)
        .emit('ball', { message: 'ball position', ballPosition });

      gameRoom.gameStatus = gameStatus.GAMEPLAYING;

      let score: number[];

      if (gameRoom.gameStatus == gameStatus.GAMEPLAYING) {
        const interval = setInterval(() => {
          if (gameRoom.gameStatus != gameStatus.GAMEPLAYING) {
            clearInterval(interval);
          }

          score = this.gameService.updateScore(gameRoom);
          if (score)
            this.server
              .to(gameRoom.gameRoomName)
              .emit('score', { message: 'score', score });

          this.gameService.isGameOver(gameRoom, this.server, socket);

          ballPosition =
            this.gameService.updateBallPositionAfterTouchBar(gameRoom);
          if (ballPosition)
            this.server
              .to(gameRoom.gameRoomName)
              .emit('ball', { message: 'ball position', ballPosition });

          ballPosition =
            this.gameService.updateBallPositionAferTouchTopOrBottom(gameRoom);
          if (ballPosition)
            this.server
              .to(gameRoom.gameRoomName)
              .emit('ball', { message: 'ball position', ballPosition });

          ballPosition = this.gameService.updateBallPositionAndVelocity(
            gameRoom.playing.ball.position.x,
            gameRoom.playing.ball.position.y,
            gameRoom,
          );
          if (ballPosition)
            this.server
              .to(gameRoom.gameRoomName)
              .emit('ball', { message: 'ball position', ballPosition });
        }, 30);
      } else {
        gameRoom.gameStatus = gameStatus.COUNTDOWN;

        throw new HttpException(
          '게임 시작 전 GAMEPLAYING 문제 발생했습니다.',
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @SubscribeMessage('exitGameRoom')
  async exitGameRoom(socket: Socket, @Body() body: GameRoomNameDto) {
    try {
      const user: User = socket.data.user;
      if (!user)
        throw new HttpException(
          '소켓 연결 유저 없습니다.',
          HttpStatus.BAD_REQUEST,
        );

      const gameRoom = this.gameService.findGameRoom(body.gameRoomName);
      if (!gameRoom)
        throw new HttpException(
          '존재하지 않는 게임룸 입니다',
          HttpStatus.BAD_REQUEST,
        );

      const player: GamePlayerDto = this.gameService.findPlayerInGameRoom(
        user.id,
        body.gameRoomName,
      );

      const spectator: GamePlayerDto = this.gameService.findSpectatorInGameRoom(
        user.id,
        body.gameRoomName,
      );

      if (player || spectator) {
        await this.gameService.exitGameRoom(this.server, socket);

        if (player)
          this.server.to(gameRoom.gameRoomName).emit('exitGameRoom', {
            message: `${player.user.username}가 게임룸에서 나갑니다.`,
          });
        if (spectator)
          this.server
            .to(gameRoom.gameRoomName)
            .emit('exitGameRoom', { message: `관찰자가 게임룸에서 나갑니다.` });
        socket.emit('exitGameRoom', { message: `게임룸에서 나왔습니다.` });
        // await this.userService.updateStatus(user.id, userStatus.GAMECHANNEL);
        await this.userService.updateStatus(user.id, userStatus.INGAME);
      } else {
        throw new HttpException(
          '해당룸에 당신은 존재하지 않습니다.',
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /* --------------------------
	|				randomGameMatch 		|
	---------------------------*/

  @SubscribeMessage('randomGameMatch')
  randomGameMatching(socket: Socket): void {
    try {
      const user: User = socket.data.user;
      if (!user)
        throw new HttpException(
          '소켓 연결 유저 없습니다.',
          HttpStatus.BAD_REQUEST,
        );

      const gameRoomName = this.gameService.randomGameMatching(socket);

      if (gameRoomName) {
        this.server.to(gameRoomName).emit('randomGameMatch', {
          message: '랜덤 매칭 된 룸 이름입니다.',
          gameRoomName,
        });
      }
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /* --------------------------
	|				touchBar 		|
	---------------------------*/

  @SubscribeMessage('touchBar')
  updatetouchBar(socket: Socket, @Body() body: TouchBarDto): void {
    try {
      const user: User = socket.data.user;
      if (!user)
        throw new HttpException(
          '소켓 연결 유저 없습니다.',
          HttpStatus.BAD_REQUEST,
        );

      const gameRoom = this.gameService.findGameRoom(body.gameRoomName);
      if (!gameRoom)
        throw new HttpException(
          '존재하지 않는 게임룸 입니다',
          HttpStatus.BAD_REQUEST,
        );

      const player: GamePlayerDto = this.gameService.findPlayerInGameRoom(
        socket.data.user.id,
        body.gameRoomName,
      );
      if (!player)
        throw new HttpException(
          '해당룸에 플레이어는 존재하지 않습니다.',
          HttpStatus.BAD_REQUEST,
        );

      player.touchBar = body.touchBar * gameRoom.facts.display.height;
      this.server.to(gameRoom.gameRoomName).emit('touchBar', {
        message: 'touchBar',
        player: player.user.id,
        touchBar: body.touchBar,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /* --------------------------
	|				createInviteRoom 		|
	|				responseInvite 		|
	|				inviteGameRoomInfo |
	---------------------------*/

  @SubscribeMessage('createInviteRoom')
  async createInviteRoom(socket: Socket, @Body() body: InviteUserDto) {
    try {
      const user: User = socket.data.user;
      if (!user)
        throw new HttpException(
          '소켓 연결 유저 없습니다.',
          HttpStatus.BAD_REQUEST,
        );

      const target = await this.userService
        .findUserById(body.userId)
        .catch(() => null);
      if (!target)
        throw new HttpException(
          '해당 타겟 유저는 존재하지 않습니다.',
          HttpStatus.BAD_REQUEST,
        );

      const targetSocket: Socket = socket_username[target.username];
      if (!targetSocket) {
        throw new HttpException(
          '상대방은 채팅 가능 상태가 아닙니다.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const randomInviteRoomName = String(Math.floor(Math.random() * 1e9));
      socket.join(randomInviteRoomName);
      targetSocket.join(randomInviteRoomName);

      socket.to(randomInviteRoomName).emit('requestInvite', {
        message: '게임 초대 위한 요청',
        randomInviteRoomName,
        hostId: user.id,
        targetId: target.id,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @SubscribeMessage('responseInvite')
  async responseInvite(socket: Socket, @Body() body: ResponseInviteDto) {
    try {
      socket.to(body.randomInviteRoomName).emit('responseInvite', {
        message: '게임 초대 요청에 대한 응답',
        randomInviteRoomName: body.randomInviteRoomName,
        hostId: body.hostId,
        targetId: body.targetId,
        response: body.response,
      });
      if (body.response == false) {
        const host = await this.userService.findUserById(body.hostId);
        const target = await this.userService.findUserById(body.targetId);
        const hostSocket: Socket = socket_username[host.username];
        const targetSocket: Socket = socket_username[target.username];
        hostSocket.leave(body.randomInviteRoomName);
        targetSocket.leave(body.randomInviteRoomName);
      }
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
  //response == true 이면
  //게임 신청유저 -> "emit.createGameRoom" -> "emit.joinGameRoom" -> "emit.inviteGameRoomInfo"
  //초대 받은유저 -> 'on.inviteGameRoomInfo' -> emit.joinGameRoom
  @SubscribeMessage('inviteGameRoomInfo')
  async inviteGameRoomInfo(
    socket: Socket,
    @Body() body: InviteGameRoomInfoDto,
  ) {
    try {
      socket.to(body.inviteGameRoomName).emit('inviteGameRoomInfo', {
        message: '게임룸 참여를 위한 정보',
        randomInviteRoomName: body.randomInviteRoomName,
        hostId: body.hostId,
        targetId: body.targetId,
        gameRoomName: body.inviteGameRoomName,
      });

      const host = await this.userService.findUserById(body.hostId);
      const target = await this.userService.findUserById(body.targetId);
      const hostSocket: Socket = socket_username[host.username];
      const targetSocket: Socket = socket_username[target.username];
      hostSocket.leave(body.randomInviteRoomName);
      targetSocket.leave(body.randomInviteRoomName);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
}
