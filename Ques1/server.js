/**
 * Smart Elevator Control System
 * - Node.js script (run with `node index.js`)
 *
 * Features implemented:
 * - multiple elevators & floors
 * - capacity limits (max people and max weight)
 * - requests from floors with destination
 * - elevator assignment heuristic (position, direction, idle)
 * - elevator states: MOVING, OPEN_DOOR, CLOSE_DOOR, IDLE
 * - elevators move one floor per tick
 * - door open/close with delay
 * - pending request queue for unfulfilled requests
 * - logging / realtime console updates
 *
 * This is a simulation (time-driven) — adjust ticks and delays as needed.
 */

const uuid = () => Math.random().toString(36).slice(2, 9);

// Elevator states
const STATES = {
  IDLE: 'IDLE',
  MOVING: 'MOVING',
  OPEN_DOOR: 'OPEN_DOOR',
  CLOSE_DOOR: 'CLOSE_DOOR',
};

// Direction constants
const DIR = {
  UP: 'UP',
  DOWN: 'DOWN',
  NONE: 'NONE',
};

class Passenger {
  constructor(fromFloor, toFloor, weight = 70) {
    this.id = uuid();
    this.from = fromFloor;
    this.to = toFloor;
    this.weight = weight;
  }
}

class Elevator {
  constructor(id, totalFloors, opts = {}) {
    this.id = id;
    this.totalFloors = totalFloors;
    this.currentFloor = 1;
    this.state = STATES.IDLE;
    this.direction = DIR.NONE;
    this.maxPeople = opts.maxPeople || 8;
    this.maxWeight = opts.maxWeight || 680; // kg
    this.passengers = []; // inside elevator
    this.targets = new Set(); // floors elevator must stop at (destinations & pickups)
    this.doorTimer = 0; // ticks remaining while doors open
    this.tickTimeMs = opts.tickTimeMs || 1000;
    this.logPrefix = `[Elevator-${this.id}]`;
  }

  occupancyCount() {
    return this.passengers.length;
  }

  occupancyWeight() {
    return this.passengers.reduce((s, p) => s + p.weight, 0);
  }

  isFull() {
    return this.occupancyCount() >= this.maxPeople || this.occupancyWeight() >= this.maxWeight;
  }

  addTarget(floor) {
    if (floor < 1 || floor > this.totalFloors) return;
    this.targets.add(floor);
    // update direction if idle
    if (this.state === STATES.IDLE) {
      if (this.currentFloor === floor) {
        this.openDoorImmediately();
      } else {
        this.state = STATES.MOVING;
        this.direction = floor > this.currentFloor ? DIR.UP : DIR.DOWN;
      }
    }
  }

  openDoorImmediately() {
    this.state = STATES.OPEN_DOOR;
    this.direction = DIR.NONE;
    this.doorTimer = 2; // ticks doors stay open
  }

  stepTick(pendingRequests) {
    // Called once per simulation tick
    switch (this.state) {
      case STATES.IDLE:
        if (this.targets.size > 0) {
          // start moving toward nearest target
          const floor = this.closestTarget();
          if (floor !== this.currentFloor) {
            this.direction = floor > this.currentFloor ? DIR.UP : DIR.DOWN;
            this.state = STATES.MOVING;
          } else {
            this.openDoorImmediately();
          }
        }
        break;

      case STATES.MOVING:
        // move one floor
        if (this.direction === DIR.UP) {
          if (this.currentFloor < this.totalFloors) this.currentFloor++;
        } else if (this.direction === DIR.DOWN) {
          if (this.currentFloor > 1) this.currentFloor--;
        }

        // If we reached a target, open doors
        if (this.targets.has(this.currentFloor)) {
          this.targets.delete(this.currentFloor);
          this.state = STATES.OPEN_DOOR;
          this.doorTimer = 2; // door open ticks
        }
        break;

      case STATES.OPEN_DOOR:
        // handle passenger leaving
        this.handleAlightings();

        // handle boarding from pending requests that match this floor & direction or any if idle
        this.handleBoardings(pendingRequests);

        this.doorTimer--;
        if (this.doorTimer <= 0) {
          this.state = STATES.CLOSE_DOOR;
        }
        break;

      case STATES.CLOSE_DOOR:
        // after closing, decide next move
        if (this.targets.size > 0) {
          const next = this.closestTarget();
          this.direction = next > this.currentFloor ? DIR.UP : DIR.DOWN;
          this.state = STATES.MOVING;
        } else {
          this.state = STATES.IDLE;
          this.direction = DIR.NONE;
        }
        break;
    }
  }

  closestTarget() {
    if (this.targets.size === 0) return this.currentFloor;
    let best = null;
    let bestDist = Infinity;
    this.targets.forEach((t) => {
      const d = Math.abs(this.currentFloor - t);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    });
    return best;
  }

  handleAlightings() {
    if (this.passengers.length === 0) return;
    const before = this.passengers.length;
    this.passengers = this.passengers.filter((p) => p.to !== this.currentFloor);
    const after = this.passengers.length;
    if (before !== after) {
      console.log(`${this.logPrefix} ${before - after} passenger(s) alighted at floor ${this.currentFloor}`);
    }
  }

  handleBoardings(pendingRequests) {
    // Try to board passengers waiting at this floor (pendingRequests is array referenced externally)
    // Boarding rules:
    // - Elevator shouldn't exceed people & weight limits
    // - Prefer requests whose direction matches elevator direction, or if elevator idle take anyone
    // We'll mutate pendingRequests (remove boarded ones)
    for (let i = pendingRequests.length - 1; i >= 0; i--) {
      const req = pendingRequests[i];
      if (req.from !== this.currentFloor) continue;
      // decide if direction matches
      const reqDir = req.to > req.from ? DIR.UP : DIR.DOWN;
      if (this.state === STATES.OPEN_DOOR) {
        // if elevator is empty or moving same direction or IDLE accept
        if (this.direction === DIR.NONE || this.direction === reqDir || this.targets.size === 0) {
          // check capacity
          const willBeFull = (this.occupancyCount() + 1) > this.maxPeople;
          const willBeOverweight = (this.occupancyWeight() + req.weight) > this.maxWeight;
          if (!willBeFull && !willBeOverweight) {
            // board
            this.passengers.push(req);
            this.targets.add(req.to);
            pendingRequests.splice(i, 1);
            console.log(`${this.logPrefix} Passenger boarded at floor ${this.currentFloor} -> ${req.to} (weight ${req.weight}kg)`);
            // continue boarding other passengers if capacity allows
          } else {
            // cannot board due to capacity/weight — leave in queue
            // if elevator full, no more boarding
            if (this.isFull()) {
              // can't board more
              break;
            }
          }
        }
      }
    }
  }

  status() {
    return {
      id: this.id,
      floor: this.currentFloor,
      state: this.state,
      direction: this.direction,
      people: this.occupancyCount(),
      weight: this.occupancyWeight(),
      targets: Array.from(this.targets).sort((a, b) => a - b),
    };
  }
}

class ElevatorSystem {
  constructor(numElevators = 3, totalFloors = 10, opts = {}) {
    this.elevators = [];
    this.totalFloors = totalFloors;
    this.pendingRequests = []; // queued requests {from,to,weight}
    for (let i = 1; i <= numElevators; i++) {
      this.elevators.push(new Elevator(i, totalFloors, opts));
    }
    this.tickMs = opts.tickMs || 1000; // how often the sim advances (ms)
    this.tickHandle = null;
    this.tickCount = 0;
  }

  // a passenger makes a request (from floor -> to floor)
  requestElevator(from, to, weight = 70) {
    if (from < 1 || from > this.totalFloors || to < 1 || to > this.totalFloors || from === to) {
      console.log(`[System] Invalid request from ${from} to ${to} — ignored.`);
      return;
    }
    const passenger = new Passenger(from, to, weight);
    // Try assign immediately
    const assigned = this.tryAssignElevator(passenger);
    if (!assigned) {
      // push to pending queue for later assignment
      this.pendingRequests.push(passenger);
      console.log(`[System] No suitable elevator immediately available. Request queued: ${from} -> ${to}`);
    } else {
      console.log(`[System] Assigned passenger ${passenger.id} to Elevator-${assigned.id} for ${from} -> ${to}`);
    }
  }

  tryAssignElevator(passenger) {
    // Heuristic to pick best elevator:
    // - prefer elevator already at the floor and not full => open door immediately
    // - prefer elevator moving towards the floor in same direction (and will pass by)
    // - prefer idle elevator closest to the floor
    // Score system: lower is better
    const reqFloor = passenger.from;
    const reqDir = passenger.to > passenger.from ? DIR.UP : DIR.DOWN;

    let bestElevator = null;
    let bestScore = Infinity;

    for (const el of this.elevators) {
      // cannot board if full
      if (el.isFull()) continue;

      const dist = Math.abs(el.currentFloor - reqFloor);
      let score = dist * 10; // base cost by distance

      // if elevator is at floor
      if (el.currentFloor === reqFloor && (el.state === STATES.IDLE || el.state === STATES.OPEN_DOOR || el.state === STATES.CLOSE_DOOR)) {
        score -= 1000; // immediate best
      }

      // If elevator is moving and direction matches and will pass the floor, prefer it
      if (el.state === STATES.MOVING) {
        if (
          (el.direction === DIR.UP && el.currentFloor <= reqFloor && reqDir === DIR.UP) ||
          (el.direction === DIR.DOWN && el.currentFloor >= reqFloor && reqDir === DIR.DOWN)
        ) {
          score -= 200; // good candidate
        } else {
          score += 50; // opposite direction
        }
      }

      // if idle, small bonus
      if (el.state === STATES.IDLE) score -= 50;

      // availability also consider weight capacity: if passenger alone would exceed weight -> skip
      if (passenger.weight + el.occupancyWeight() > el.maxWeight) continue;

      if (score < bestScore) {
        bestScore = score;
        bestElevator = el;
      }
    }

    if (bestElevator) {
      // add pickup floor and if elevator not at that floor ensure it will move there
      bestElevator.addTarget(passenger.from);
      // we add passenger to pendingRequests but mark that elevator will pick them: a simple approach is to add the passenger to pendingRequests but record assignedElevator
      // To immediately board if elevator is at floor and doors open, we can try to board now
      // For simplicity here we'll add to pendingRequests and rely on boarding logic when elevator reaches
      this.pendingRequests.push(passenger); // it will get removed when boarding.
      return bestElevator;
    }
    return null;
  }

  releasePendingToIdleElevators() {
    // Try to assign queued requests to idle elevators (periodic)
    for (let i = this.pendingRequests.length - 1; i >= 0; i--) {
      const req = this.pendingRequests[i];
      // try to find an elevator again
      const el = this.tryAssignElevatorDirect(req);
      if (el) {
        // tryAssignElevatorDirect will add the target to elevator; we should remove old queued copy
        // But note: tryAssignElevatorDirect uses current pendingRequests, so to avoid duplicates, ensure removal
        // We'll remove this queued request (since it will be onboarded when elevator arrives)
        // find index again (could have duplicates), remove by matching id
        const idx = this.pendingRequests.findIndex((p) => p.id === req.id);
        if (idx !== -1) this.pendingRequests.splice(idx, 1);
      }
    }
  }

  tryAssignElevatorDirect(passenger) {
    // Same as tryAssignElevator but DOES NOT push to pendingRequests — only assign target to elevator
    const reqFloor = passenger.from;
    const reqDir = passenger.to > passenger.from ? DIR.UP : DIR.DOWN;

    let bestElevator = null;
    let bestScore = Infinity;

    for (const el of this.elevators) {
      if (el.isFull()) continue;
      if (passenger.weight + el.occupancyWeight() > el.maxWeight) continue;
      const dist = Math.abs(el.currentFloor - reqFloor);
      let score = dist * 10;
      if (el.currentFloor === reqFloor && (el.state === STATES.IDLE || el.state === STATES.OPEN_DOOR || el.state === STATES.CLOSE_DOOR)) {
        score -= 1000;
      }
      if (el.state === STATES.MOVING) {
        if (
          (el.direction === DIR.UP && el.currentFloor <= reqFloor && reqDir === DIR.UP) ||
          (el.direction === DIR.DOWN && el.currentFloor >= reqFloor && reqDir === DIR.DOWN)
        ) {
          score -= 200;
        } else {
          score += 50;
        }
      }
      if (el.state === STATES.IDLE) score -= 50;
      if (score < bestScore) {
        bestScore = score;
        bestElevator = el;
      }
    }

    if (bestElevator) {
      bestElevator.addTarget(passenger.from);
      return bestElevator;
    }
    return null;
  }

  // simulate tick
  tick() {
    this.tickCount++;
    // first try to assign queued requests where possible
    // (e.g., if an elevator is idle now)
    for (let i = this.pendingRequests.length - 1; i >= 0; i--) {
      const req = this.pendingRequests[i];
      const assigned = this.tryAssignElevatorDirect(req);
      if (assigned) {
        console.log(`[System] Pending request ${req.id} assigned to Elevator-${assigned.id}`);
        // keep the passenger in pendingRequests until boarding occurs in Elevator.handleBoardings
        // to avoid duplicate assignment we will leave the passenger in the pendingRequests array.
      }
    }

    // then step each elevator
    for (const el of this.elevators) {
      el.stepTick(this.pendingRequests);
    }

    // log status for monitoring
    this.logStatus();

    // optional: auto-release pending requests occasionally to avoid starvation
    if (this.tickCount % 10 === 0) {
      this.releasePendingToIdleElevators();
    }
  }

  logStatus() {
    console.log('\n--- System Status ---');
    for (const el of this.elevators) {
      const s = el.status();
      console.log(
        `${el.logPrefix} Floor:${s.floor} State:${s.state} Dir:${s.direction} People:${s.people} Weight:${s.weight} Targets:[${s.targets}]`
      );
    }
    if (this.pendingRequests.length > 0) {
      console.log(`[System] Pending Requests (${this.pendingRequests.length}): ${this.pendingRequests
        .map((r) => `${r.from}->${r.to}`)
        .join(', ')}`);
    } else {
      console.log('[System] No pending requests');
    }
    console.log('---------------------\n');
  }

  startSimulation(ticks = 60) {
    console.log(`[System] Starting simulation for ${ticks} ticks (tick=${this.tickMs}ms)`);
    let executed = 0;
    this.tickHandle = setInterval(() => {
      this.tick();
      executed++;
      if (executed >= ticks) {
        clearInterval(this.tickHandle);
        console.log('[System] Simulation finished.');
      }
    }, this.tickMs);
  }

  stopSimulation() {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }
}

/* ---------------------------
   Example usage / simulation
   --------------------------- */

if (require.main === module) {
  // Create system: 3 elevators, 12 floors
  const system = new ElevatorSystem(3, 12, { tickMs: 700 });

  // Sample requests (simulate people pressing buttons at times)
  setTimeout(() => system.requestElevator(1, 7, 60), 300); // from 1 -> 7
  setTimeout(() => system.requestElevator(3, 9, 70), 1500); // from 3 -> 9
  setTimeout(() => system.requestElevator(10, 2, 80), 2200); // from 10 -> 2
  setTimeout(() => system.requestElevator(5, 12, 65), 5000); // from 5 -> 12
  setTimeout(() => system.requestElevator(2, 6, 90), 7000); // from 2 -> 6
  setTimeout(() => system.requestElevator(11, 1, 75), 9000); // from 11 -> 1

  // Over-capacity test: many passengers at same floor
  setTimeout(() => {
    for (let i = 0; i < 10; i++) {
      system.requestElevator(4, 8, 70 + (i % 3) * 10); // many requests from floor 4 -> 8
    }
  }, 12000);

  system.startSimulation(80); // run 80 ticks then stop
}
