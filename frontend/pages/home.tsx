import MainLayout from '@/layouts/MainLayout';
import Head from 'next/head';
import Link from 'next/link';

import { ReactElement, useEffect, useState } from 'react';
import {
  Button,
  Center,
  Flex,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import { CustomButton } from '@/components/CustomButton';
import { gameStore } from '@/stores/gameStore';
import { useRouter } from 'next/router';

export default function HomePage() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [timeSpent, setTimeSpent] = useState<number>(1);
  const { socket, room, isSetting, setIsSetting, makeSocket, disconnectSocket } = gameStore();
  const router = useRouter();

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  useEffect(() => {
    const id = setInterval(() => setTimeSpent((cur) => cur + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function handleMatchBtnClicked() {
    setTimeSpent(1);
    if (socket === undefined || socket.connected === false) {
      console.log('socket is not Working');
      alert('socket is not Working');
    } else {
      onOpen();
      sleep(2000).then(() => {
        console.log(socket);
        console.log('EMIT : Random Game Match');
        socket.emit('randomGameMatch');
      });
    }
  }

  function handleMatchCancelBtnClicked() {
    if (room.gameRoomName === '') {
      if (socket !== undefined) {
        socket.emit('removeSocketInQueue');
        socket.removeAllListeners();
        disconnectSocket();
        setIsSetting(0);
        console.log('socket is disconnected');
      }
    }
    onClose();
  }

  useEffect(() => {
    if (socket === undefined || isSetting === 0) {
      return;
    }
    console.log(`FIND Room : ${room.gameRoomName}`);
    router.push('/game/options');
    console.log('Ready to play game');
  }, [isSetting]);

  useEffect(() => {
    sleep(300).then(() => {
      if (socket === undefined || socket.connected === false) {
        console.log('Socket Making');
        makeSocket();
      }
    });
  }, [socket]);

  return (
    <>
      <Head>
        <title>LastPong</title>
        <meta name="description" content="ft_transcendence project in 42 Seoul" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Flex height={'100%'} flexDir={'column'} alignItems="center" justifyContent={'center'}>
        <Image src="/HowToPlay.png" height="90%" alt="How To Play LastPong" />
        <CustomButton
          size="2xl"
          onClick={handleMatchBtnClicked}
          btnStyle={{ position: 'absolute', bottom: '13%', right: '52%' }}
        >
          MATCH
        </CustomButton>
      </Flex>
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent bg="main" color="white">
          <Center>
            <VStack>
              <ModalHeader>LOOKING FOR AN OPPONENT...</ModalHeader>
              <ModalBody fontSize="6xl">{timeSpent}</ModalBody>
              <ModalFooter>
                <CustomButton size="md" onClick={handleMatchCancelBtnClicked}>
                  CANCEL
                </CustomButton>
              </ModalFooter>
            </VStack>
          </Center>
        </ModalContent>
      </Modal>
    </>
  );
}

HomePage.getLayout = function (page: ReactElement) {
  return <MainLayout>{page}</MainLayout>;
};
