import { Navbar, NavbarCenter } from '@renderer/components/app/Navbar'
import { SimpleCalendar } from '@renderer/components/calendar'
import { FC } from 'react'
import styled from 'styled-components'

const CalendarPage: FC = () => {
  return (
    <Container>
      <Navbar>
        <NavbarCenter>简易日历</NavbarCenter>
      </Navbar>
      <Content>
        <SimpleCalendar />
      </Content>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
`

const Content = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 16px;
  overflow-y: auto;
`

export default CalendarPage
