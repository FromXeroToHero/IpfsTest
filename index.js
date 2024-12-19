import process from "node:process";
import readline from "readline";
import { create } from "kubo-rpc-client";
import { createLibp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { mplex } from "@libp2p/mplex";
import { multiaddr } from "multiaddr";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { identify } from "@libp2p/identify";
import { TextEncoder } from "util";
import { mdns } from "@libp2p/mdns";

import all from "it-all";
import concat from "uint8-concat";

const topic = "chat";

const client = create();

async function startLibp2p() {
  const node = await createLibp2p({
    addresses: {
      listen: ["/ip4/0.0.0.0/tcp/0/ws"],
      //"/ip4/0.0.0.0/tcp/0"
    },
    transports: [webSockets(), tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    services: {
      pubsub: gossipsub({
        emitSelf: true,
        gossipIncoming: false,
        // msgIdFn:,
      }),
      identify: identify(),
      //dht: kadDHT(),
    },
    peerDiscovery: [mdns()],
  });

  // start libp2p
  await node.start();
  console.log("libp2p has started");
  console.log("listening on addresses:");
  node.getMultiaddrs().forEach((addr) => {
    console.log(addr.toString());
  });

  node.addEventListener("peer:discovery", (evt) => {
    const peerId = evt.detail.id;
    console.log(`Discovered peer: ${peerId.toString()}`);
    node.dial(peerId);
  });

  node.addEventListener("peer:connect", (evt) => {
    console.log(`Connected to peer: ${evt.detail.toString()}`);
  });

  node.addEventListener("peer:disconnect", (evt) => {
    const peerId = evt.detail;
    console.log(`Disconnected from ${peerId.toString()}`);
  });

  node.services.pubsub.subscribe(topic);

  node.services.pubsub.addEventListener("message", async (message) => {
    const cid = new TextDecoder().decode(message.detail.data);
    const messageData = concat(await all(client.cat(cid)));
    const decodedData = new TextDecoder().decode(messageData).toString();
    console.log(`${topic}: ${decodedData}`);
  });

  return node;
}

async function sendMessage(libp2p, topic, message) {
  if (message == "") return;
  const { cid } = await client.add(message);
  // console.log(cid.toString());
  const data = new TextEncoder().encode(cid);

  await libp2p.services.pubsub.publish(topic, data);
  // console.log(`(${topic}) You: ${message}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function startApp() {
  const node = await startLibp2p();

  rl.on("line", async (input) => {
    if (input === "exit") {
      console.log("Shutting down...");
      rl.close();
      await node.stop();
      process.exit(0);
    } else {
      await sendMessage(node, topic, input);
    }
  });

  console.log("Type a message to send (or 'exit' to quit):");
}

startApp().catch((err) => console.error("Error starting app:", err));

const stop = async () => {
  await node.stop();
  console.log("libp2p has stopped");
  process.exit(0);
};

process.on("SIGTERM", stop);
process.on("SIGINT", stop);
