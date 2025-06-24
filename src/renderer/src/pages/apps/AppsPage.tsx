import { Navbar, NavbarCenter } from '@renderer/components/app/Navbar'
import { Center } from '@renderer/components/Layout'
import { useMinapps } from '@renderer/hooks/useMinapps'
import { PlusOutlined } from '@ant-design/icons'
import { Empty, Input, Button, Tooltip } from 'antd'
import { isEmpty } from 'lodash'
import { Search } from 'lucide-react'
import React, { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import CustomMiniAppForm from '@renderer/pages/settings/MiniappSettings/CustomMiniAppForm'
import { MinAppType } from '@renderer/types'

import App from './App'

const AppsPage: FC = () => {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { minapps, updateMinapps } = useMinapps()
  const [formVisible, setFormVisible] = useState(false)

  const filteredApps = search
    ? minapps.filter(
      (app) => app.name.toLowerCase().includes(search.toLowerCase()) || app.url.includes(search.toLowerCase())
    )
    : minapps

  // 处理添加自定义小程序
  const handleAddApp = (app: MinAppType) => {
    const updatedApps = [...minapps, app]
    updateMinapps(updatedApps)
  }

  // Calculate the required number of lines
  const itemsPerRow = Math.floor(930 / 115) // Maximum width divided by the width of each item (including spacing)
  const rowCount = Math.ceil(filteredApps.length / itemsPerRow)
  // Each line height is 85px (60px icon + 5px margin + 12px text + spacing)
  const containerHeight = rowCount * 85 + (rowCount - 1) * 25 // 25px is the line spacing.

  // Disable right-click menu in blank area
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  return (
    <Container onContextMenu={handleContextMenu}>
      <Navbar>
        <NavbarCenter style={{ borderRight: 'none', justifyContent: 'space-between', paddingRight: '120px' }}>
          <div>{t('minapp.title')}</div>
          <SearchContainer>
            <Input
              placeholder={t('common.search')}
              className="nodrag"
              style={{ width: '100%', height: 28, borderRadius: 15 }}
              size="small"
              variant="filled"
              suffix={<Search size={18} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </SearchContainer>
          <ActionContainer>
            <Tooltip title={t('settings.miniapps.custom.add_button')}>
              <AddButton
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setFormVisible(true)}
              />
            </Tooltip>
          </ActionContainer>
        </NavbarCenter>
      </Navbar>
      <ContentContainer id="content-container">
        {isEmpty(filteredApps) ? (
          <Center>
            <Empty />
          </Center>
        ) : (
          <AppsContainer style={{ height: containerHeight }}>
            {filteredApps.map((app) => (
              <App key={app.id} app={app} />
            ))}
          </AppsContainer>
        )}
      </ContentContainer>

      <CustomMiniAppForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSubmit={handleAddApp}
        editingApp={undefined}
      />
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  justify-content: center;
  height: 100%;
  overflow-y: auto;
  padding: 50px;
`

const AppsContainer = styled.div`
  display: grid;
  min-width: 0;
  max-width: 930px;
  width: 100%;
  grid-template-columns: repeat(auto-fill, 90px);
  gap: 25px;
  justify-content: center;
`

const SearchContainer = styled.div`
  width: 30%;
  display: flex;
  justify-content: center;
`

const ActionContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-right: 20px;
`

const AddButton = styled(Button)`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
`

export default AppsPage
