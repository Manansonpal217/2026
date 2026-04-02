import { ConnectJira } from './ConnectJira'
import { ConnectAsana } from './ConnectAsana'

type WorkPlatform = 'none' | 'asana' | 'jira_cloud' | 'jira_self_hosted' | string

interface IntegrationConnectBarProps {
  workPlatform: WorkPlatform
  theme: 'light' | 'dark'
  onJiraConnected?: () => void
  onJiraDisconnected?: () => void
  onJiraRefresh?: () => void | Promise<void>
}

/** Renders cloud OAuth connect control from org `work_platform`; hides for self-hosted / none. */
export function IntegrationConnectBar({
  workPlatform,
  theme,
  onJiraConnected,
  onJiraDisconnected,
  onJiraRefresh,
}: IntegrationConnectBarProps) {
  if (workPlatform === 'jira_self_hosted' || workPlatform === 'none') {
    return null
  }
  if (workPlatform === 'asana') {
    return <ConnectAsana theme={theme} compact />
  }
  return (
    <ConnectJira
      theme={theme}
      compact
      onConnected={onJiraConnected}
      onDisconnected={onJiraDisconnected}
      onRefresh={onJiraRefresh}
    />
  )
}
