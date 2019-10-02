// @flow
import * as React from 'react'
import { type Store } from 'redux'
import { render, fireEvent, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { ConnectedRouter } from 'connected-react-router'
import { sleep } from '~/utils/timer'
import { ADD_OWNER_BUTTON } from '~/routes/open/components/SafeOwnersConfirmationsForm'
import Open from '~/routes/open/container/Open'
import { aNewStore, history, type GlobalState } from '~/store'
import { getProviderInfo, getWeb3 } from '~/logic/wallets/getWeb3'
import addProvider from '~/logic/wallets/store/actions/addProvider'
import { makeProvider } from '~/logic/wallets/store/model/provider'
import { getGnosisSafeInstanceAt } from '~/logic/contracts/safeContracts'
import { whenSafeDeployed } from './builder/safe.dom.utils'

// For some reason it warns about events not wrapped in act
// But they're wrapped :(
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (/Warning.*not wrapped in act/.test(args[0])) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})

const renderOpenSafeForm = async (localStore: Store<GlobalState>) => {
  const provider = await getProviderInfo()
  const walletRecord = makeProvider(provider)
  localStore.dispatch(addProvider(walletRecord))

  return render(
    <Provider store={localStore}>
      <ConnectedRouter history={history}>
        <Open />
      </ConnectedRouter>
    </Provider>,
  )
}

const deploySafe = async (createSafeForm: any, threshold: number, numOwners: number) => {
  const web3 = getWeb3()
  const accounts = await web3.eth.getAccounts()

  expect(threshold).toBeLessThanOrEqual(numOwners)
  const form = createSafeForm.getByTestId('create-safe-form')

  // Fill Safe's name
  const nameInput: HTMLInputElement = createSafeForm.getByPlaceholderText('Name of the new Safe')

  await act(async () => {
    fireEvent.change(nameInput, { target: { value: 'Adolfo Safe' } })
    fireEvent.submit(form)
  })

  // Fill owners
  const addedUpfront = 1
  const addOwnerButton = createSafeForm.getByTestId('add-owner-btn')

  expect(addOwnerButton.getElementsByTagName('span')[0].textContent).toEqual(ADD_OWNER_BUTTON)
  for (let i = addedUpfront; i < numOwners; i += 1) {
    /* eslint-disable */
    await act(async () => {
      fireEvent.click(addOwnerButton)
    })
    /* eslint-enable */
  }

  const ownerNameInputs = createSafeForm.getAllByPlaceholderText('Owner Name*')
  const ownerAddressInputs = createSafeForm.getAllByPlaceholderText('Owner Address*')
  expect(ownerNameInputs.length).toBe(numOwners)
  expect(ownerAddressInputs.length).toBe(numOwners)

  for (let i = addedUpfront; i < numOwners; i += 1) {
    const ownerNameInput = ownerNameInputs[i]
    const ownerAddressInput = ownerAddressInputs[i]

    /* eslint-disable */
    await act(async () => {
      fireEvent.change(ownerNameInput, { target: { value: `Owner ${i + 1}` } })
      fireEvent.change(ownerAddressInput, { target: { value: accounts[i] } })
    })
    /* eslint-enable */
  }

  // Fill Threshold
  // The test is fragile here, MUI select btn is hard to find
  const thresholdSelect = createSafeForm.getAllByRole('button')[2]
  await act(async () => {
    fireEvent.click(thresholdSelect)
  })

  const thresholdOptions = createSafeForm.getAllByRole('option')
  await act(async () => {
    fireEvent.click(thresholdOptions[numOwners - 1])
    fireEvent.submit(form)
  })

  // Submit
  await act(async () => {
    fireEvent.submit(form)
  })

  // giving some time to the component for updating its state with Safe
  // before destroying its context
  return whenSafeDeployed()
}

const aDeployedSafe = async (specificStore: Store<GlobalState>, threshold?: number = 1, numOwners?: number = 1) => {
  const safe: React.Component<{}> = await renderOpenSafeForm(specificStore)
  await sleep(1500)
  const safeAddress = await deploySafe(safe, threshold, numOwners)

  return safeAddress
}

describe('DOM > Feature > CREATE a Safe', () => {
  it('fills correctly the Safe form with 4 owners and 4 threshold and creates a Safe', async () => {
    const owners = 4
    const threshold = 4
    const store = aNewStore()
    const address = await aDeployedSafe(store, threshold, owners)
    expect(address).not.toBe(null)
    expect(address).not.toBe(undefined)

    const gnosisSafe = await getGnosisSafeInstanceAt(address)
    const storedOwners = await gnosisSafe.getOwners()
    expect(storedOwners.length).toEqual(4)
    const safeThreshold = await gnosisSafe.getThreshold()
    expect(Number(safeThreshold)).toEqual(4)
  })
})
