import { getSetupProgress } from '@/lib/setup'
import SetupWizard from '@/components/setup/SetupWizard'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  const progress = await getSetupProgress()

  if (progress.required) {
    return (
      <SetupWizard
        initialStep={progress.currentStep}
        completedSteps={progress.completedSteps}
      />
    )
  }

  return <LoginForm />
}
