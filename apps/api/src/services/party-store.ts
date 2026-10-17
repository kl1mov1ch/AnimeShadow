import type { Prisma, PrismaClient } from "@animeshadow/db";

export interface PartyStore {
  load(): Promise<unknown[]>;
  save(code: string, state: unknown): Promise<void>;
  remove(code: string): Promise<void>;
  flush(): Promise<void>;
}

/** Serialize writes so an older checkpoint cannot resurrect a closed room. */
export class PrismaPartyStore implements PartyStore {
  private tail: Promise<void> = Promise.resolve();
  constructor(private prisma: PrismaClient, private warn: (error: unknown) => void) {}
  async load() { return (await this.prisma.watchPartyRoom.findMany()).map((room) => room.state); }
  private enqueue(work: () => Promise<unknown>) {
    const next = this.tail.then(work).then(() => undefined);
    this.tail = next.catch(this.warn);
    return next;
  }
  save(code: string, state: unknown) {
    const value = JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue;
    return this.enqueue(() => this.prisma.watchPartyRoom.upsert({ where: { code }, create: { code, state: value }, update: { state: value } }));
  }
  remove(code: string) { return this.enqueue(() => this.prisma.watchPartyRoom.deleteMany({ where: { code } })); }
  flush() { return this.tail; }
}
