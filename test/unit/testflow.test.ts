import {
    developmentChains,
    FUNC,
    MIN_DELAY,
    NEW_STORE_VALUE,
    PROPOSAL_DESCRIPTION,
    VOTING_DELAY,
    VOTING_PERIOD,
} from "../../helper-hardhat-config"
// @ts-ignore
import { network, ethers, deployments } from "hardhat"
import { Box, GovernanceToken, GovernorContract, TimeLock } from "../../typechain-types"
import { assert, expect } from "chai"
import { moveBlocks } from "../../utils/move-block"
import { moveTime } from "../../utils/move-time"

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Governor Flow", function () {
          let box: Box
          let governanceToken: GovernanceToken
          let governorContract: GovernorContract
          let timeLock: TimeLock
          const voteWay = 1
          const reason = "I like a do da cha cha"

          beforeEach(async () => {
              await deployments.fixture(["all"])
              box = await ethers.getContract("Box")
              governanceToken = await ethers.getContract("GovernanceToken")
              governorContract = await ethers.getContract("GovernorContract")
              timeLock = await ethers.getContract("TimeLock")
          })

          it("Can only change value through governance", async () => {
              await expect(box.store(NEW_STORE_VALUE)).to.be.revertedWith(
                  "Ownable: caller is not the owner"
              )
          })

          it("Propose, queue and execute", async () => {
              // propose
              const encodedFunctionCall = box.interface.encodeFunctionData(FUNC, [NEW_STORE_VALUE])
              const proposeTx = await governorContract.propose(
                  [box.address],
                  [0],
                  [encodedFunctionCall],
                  PROPOSAL_DESCRIPTION
              )
              const proposeReceipt = await proposeTx.wait(1)
              const proposalId = proposeReceipt.events![0].args!.proposalId
              let proposalState = await governorContract.state(proposalId)
              console.log(`\n Current proposal state: ${proposalState}`)

              await moveBlocks(VOTING_DELAY + 1)

              proposalState = await governorContract.state(proposalId)
              assert.equal(proposalState.toString(), "1")
              console.log(`Current proposal state: ${proposalState}`)

              // vote
              const descriptionHash = ethers.utils.keccak256(
                  ethers.utils.toUtf8Bytes(PROPOSAL_DESCRIPTION)
              )

              const voteTxResponse = await governorContract.castVoteWithReason(
                  proposalId,
                  voteWay,
                  reason
              )
              await voteTxResponse.wait(1)

              await moveBlocks(VOTING_PERIOD + 1)

              proposalState = await governorContract.state(proposalId)
              assert.equal(proposalState.toString(), "4")

              // queue
              const queueTx = await governorContract.queue(
                  [box.address],
                  [0],
                  [encodedFunctionCall],
                  descriptionHash
              )
              await queueTx.wait(1)

              await moveTime(MIN_DELAY + 1)
              await moveBlocks(1)

              proposalState = await governorContract.state(proposalId)
              assert.equal(proposalState.toString(), "5")

              // execute
              const executeTx = await governorContract.execute(
                  [box.address],
                  [0],
                  [encodedFunctionCall],
                  descriptionHash
              )
              await executeTx.wait(1)

              await moveBlocks(1)

              proposalState = await governorContract.state(proposalId)
              assert.equal(proposalState.toString(), "7")
          })
      })
