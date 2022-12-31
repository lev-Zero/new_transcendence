import { ChatRoomItem } from '@/components/ChatRoomItem';
import { CustomButton } from '@/components/CustomButton';
import UserItem from '@/components/UserItem';
import { UserProps, UserStatus } from '@/interfaces/UserProps';
import MainLayout from '@/layouts/MainLayout';
import { customFetch } from '@/utils/customFetch';
import {
  Button,
  Center,
  Flex,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  useDisclosure,
  VStack,
  Text,
  Box,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Checkbox,
  ModalCloseButton,
} from '@chakra-ui/react';
import Head from 'next/head';
import { ReactElement, ReactEventHandler, ReactNode, useEffect, useRef, useState } from 'react';
import { allUserStore } from '@/stores/allUserStore';
import Link from 'next/link';
import RawUserItem from '@/components/RawUserItem';
import io, { Socket } from 'socket.io-client';
import { getJwtToken } from '@/utils/getJwtToken';
import { ChatRoomItemProps } from '@/interfaces/ChatRoomItemProps';
import { chatStore } from '@/stores/chatStore';
import { useRouter } from 'next/router';

export default function ChatPage() {
  const { allUsers, getAllUsers } = allUserStore();

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [show, setShow] = useState(false);
  const handleClick = () => setShow(!show);

  const [valueTitle, setValueTitle] = useState('');
  const [valuePassword, setValuePassword] = useState('');
  const [roomPrivate, setRoomPrivate] = useState(false);
  const handleTitle = (event: React.ChangeEvent<HTMLInputElement>) =>
    setValueTitle(event.target.value);
  const handlePassword = (event: React.ChangeEvent<HTMLInputElement>) =>
    setValuePassword(event.target.value);

  const handleRoomPrivate = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRoomPrivate(event.target.checked);
    setValuePassword('');
  };

  const { socket, makeSocket, refreshChatRoomList, chatRoomList } = chatStore();
  const router = useRouter();

  useEffect(() => {
    getAllUsers();
    if (socket === undefined) {
      makeSocket();
    }
    refreshChatRoomList();
  }, []);

  const createChatRoom = () => {
    if (valueTitle === '') {
      alert('방 제목을 입력해주십시오.');
      return;
    }
    if (roomPrivate && valuePassword === '') {
      alert('비밀번호를 입력해주십시오.');
      return;
    }
    if (socket === undefined) {
      alert('socket is undefined!');
      return;
    }

    socket.emit('createChatRoom', {
      name: valueTitle,
      status: roomPrivate ? 2 : 0,
      password: valuePassword,
    });
    socket.on('createChatRoom', (res) => {
      console.log(res.message);
      router.push(`/chat/${res.chatRoom.id}`);
    });
    onClose();
  };

  const joinChatRoom = (id: number) => {
    socket?.emit('join', { id, password: '' });
  };

  return (
    <>
      <Head>
        <title>채팅 | LastPong</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Flex w="100%" h="100%">
        <VStack w="70%" h="90%" my={10}>
          <Box overflowY="scroll" mb={10}>
            <SimpleGrid columns={2} spacing={5}>
              {chatRoomList.map((chatRoom, idx) => (
                <Link
                  key={idx}
                  href={`/chat/${chatRoom.id}`}
                  onClick={() => joinChatRoom(chatRoom.id)}
                >
                  <ChatRoomItem
                    id={chatRoom.id}
                    title={chatRoom.title}
                    owner={chatRoom.owner}
                    isPrivate={chatRoom.isPrivate}
                  />
                </Link>
              ))}
            </SimpleGrid>
          </Box>
          <Box>
            <CustomButton size="lg" onClick={onOpen}>
              CREATE
            </CustomButton>
          </Box>
        </VStack>
        <VStack w="25%" h="90%" m={10} p={7} backgroundColor="white" borderRadius={'25px'}>
          <VStack w="100%" overflowY="scroll">
            {/* 향후에 유저 상태에 따라 불러오는거 달라지면 이부분 filter 수정 */}
            {allUsers
              .filter((user) => user.status === 0)
              .map((user, index) => (
                <Link key={index} href={`/user/${user.name}`}>
                  <Flex width={'200px'}>
                    <RawUserItem user={user} />
                  </Flex>
                </Link>
              ))}
          </VStack>
        </VStack>
      </Flex>

      {/* 방생성 모달 파트 */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent bg="white" color="black" borderRadius={30}>
          <Center>
            <HStack>
              <VStack>
                <ModalHeader>
                  <ModalCloseButton />
                </ModalHeader>
                <ModalBody>
                  <HStack spacing={3}>
                    <VStack spacing={6}>
                      <Text>TITLE</Text>
                      <HStack>
                        <Text>PASSWORD</Text>
                        <Checkbox onChange={handleRoomPrivate} />
                      </HStack>
                    </VStack>
                    <VStack>
                      <Input variant="outline" placeholder="enter title" onChange={handleTitle} />

                      <InputGroup size="md">
                        <Input
                          pr="4.5rem"
                          type={show ? 'text' : 'password'}
                          placeholder="enter password"
                          onChange={handlePassword}
                          disabled={roomPrivate ? true : false}
                          bg={roomPrivate ? 'gray.200' : 'white'}
                          value={valuePassword}
                        />
                        <InputRightElement width="4.5rem">
                          <Button h="1.75rem" size="sm" onClick={handleClick}>
                            {show ? 'hide' : 'Show'}
                          </Button>
                        </InputRightElement>
                      </InputGroup>
                    </VStack>
                  </HStack>
                </ModalBody>
                <ModalFooter>
                  <VStack mb={'7'}>
                    {/* TODO:onclick 핸들러로 매치 잡는 기능 연결해야함 현재는 콘솔에 정보만 띄움 */}

                    <CustomButton size="lg" onClick={createChatRoom}>
                      CREATE
                    </CustomButton>
                  </VStack>
                </ModalFooter>
              </VStack>
            </HStack>
          </Center>
        </ModalContent>
      </Modal>
    </>
  );
}

ChatPage.getLayout = function (page: ReactElement) {
  return <MainLayout>{page}</MainLayout>;
};
