(() => {
  // Complete Car Physics Engine
  // Built from scratch with proper physics principles
  
  const PHYSICS_CONFIG = {
    // Time
    fixedTimeStep: 1/60,  // 60 Hz physics update
    maxSubSteps: 3,       // Maximum physics substeps per frame
    
    // World
    gravity: 9.81,        // m/s²
    airDensity: 1.225,    // kg/m³
    
    // Car dimensions
    car: {
      mass: 1200,         // kg
      wheelbase: 2.4,     // m
      trackWidth: 1.6,    // m
      cgHeight: 0.45,     // m - center of gravity height
      cgToFront: 1.2,     // m - distance from CG to front axle
      cgToRear: 1.2,      // m - distance from CG to rear axle
      momentOfInertia: 1500, // kg⋅m²
    },
    
    // Engine
    engine: {
      maxPower: 80000,    // W (80kW = ~107hp)
      maxTorque: 250,     // Nm
      maxRPM: 6500,
      idleRPM: 800,
      gearRatios: [3.5, 2.5, 1.8, 1.3, 1.0, -3.2], // 5 forward + reverse
      finalDrive: 3.5,
      efficiency: 0.85,
    },
    
    // Tires
    tire: {
      radius: 0.3,        // m
      width: 0.2,         // m
      mass: 15,           // kg per tire
      rollingResistance: 0.015,
      // Pacejka tire model coefficients
      pacejka: {
        B: 10,    // Stiffness
        C: 1.9,   // Shape
        D: 1.0,   // Peak
        E: 0.97,  // Curvature
      }
    },
    
    // Suspension
    suspension: {
      springRate: 35000,      // N/m
      damperRate: 3500,       // N⋅s/m
      maxTravel: 0.2,         // m
      restLength: 0.3,        // m
      antiRollBarRate: 5000,  // N/m
    },
    
    // Aerodynamics
    aero: {
      dragCoefficient: 0.32,
      frontalArea: 2.0,       // m²
      downforceCoefficient: 0.1,
    },
    
    // Brakes
    brakes: {
      maxForce: 8000,         // N
      frontBias: 0.65,        // 65% front
      handbrakeForce: 5000,   // N (rear only)
    },
    
    // Steering
    steering: {
      maxAngle: 35 * Math.PI / 180,  // radians
      speed: 2.5,                     // rad/s
      returnSpeed: 3.0,               // rad/s
      ackermanCoefficient: 0.15,      // Inner/outer wheel angle difference
    }
  };

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    
    add(v) {
      return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
    }
    
    subtract(v) {
      return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
    }
    
    multiply(scalar) {
      return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
    }
    
    dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }
    
    cross(v) {
      return new Vector3(
        this.y * v.z - this.z * v.y,
        this.z * v.x - this.x * v.z,
        this.x * v.y - this.y * v.x
      );
    }
    
    magnitude() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }
    
    normalize() {
      const mag = this.magnitude();
      if (mag === 0) return new Vector3();
      return this.multiply(1 / mag);
    }
    
    rotate2D(angle) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return new Vector3(
        this.x * cos - this.z * sin,
        this.y,
        this.x * sin + this.z * cos
      );
    }
  }

  class Tire {
    constructor(position, config) {
      this.position = position; // Local position relative to car
      this.config = config;
      
      // State
      this.compression = 0;
      this.compressionVelocity = 0;
      this.angularVelocity = 0;
      this.slipAngle = 0;
      this.slipRatio = 0;
      this.load = 0;
      this.contactPatch = null;
      this.surfaceType = 'asphalt';
      this.skidding = false;
    }
    
    updateLoad(carMass, cgHeight, acceleration, lateralAcceleration) {
      // Static load distribution
      const staticLoad = carMass * PHYSICS_CONFIG.gravity / 4;
      
      // Longitudinal weight transfer
      const longitudinalTransfer = (carMass * acceleration.magnitude() * cgHeight) / 
        (PHYSICS_CONFIG.car.wheelbase * 2);
      
      // Lateral weight transfer
      const lateralTransfer = (carMass * lateralAcceleration * cgHeight) / 
        (PHYSICS_CONFIG.car.trackWidth * 2);
      
      // Apply transfers based on tire position
      let loadTransfer = 0;
      if (this.position.x > 0) loadTransfer += lateralTransfer; // Right side
      else loadTransfer -= lateralTransfer; // Left side
      
      if (this.position.z > 0) loadTransfer -= longitudinalTransfer; // Front
      else loadTransfer += longitudinalTransfer; // Rear
      
      this.load = Math.max(0, staticLoad + loadTransfer);
    }
    
    calculateForces(velocity, angularVelocity, steerAngle) {
      if (!this.contactPatch || this.load <= 0) {
        return { force: new Vector3(), torque: 0 };
      }
      
      // Transform velocity to tire coordinates
      const tireAngle = this.position.z > 0 ? steerAngle : 0; // Front wheels steer
      const localVelocity = velocity.rotate2D(-tireAngle);
      
      // Calculate slip angle (lateral slip)
      this.slipAngle = Math.atan2(localVelocity.x, Math.abs(localVelocity.z) + 0.1);
      
      // Calculate slip ratio (longitudinal slip)
      const wheelLinearVelocity = this.angularVelocity * this.config.radius;
      const longitudinalVelocity = localVelocity.z;
      
      if (Math.abs(wheelLinearVelocity) > 0.1 || Math.abs(longitudinalVelocity) > 0.1) {
        this.slipRatio = (wheelLinearVelocity - longitudinalVelocity) / 
          Math.max(Math.abs(wheelLinearVelocity), Math.abs(longitudinalVelocity));
      } else {
        this.slipRatio = 0;
      }
      
      // Pacejka tire model
      const B = this.config.pacejka.B;
      const C = this.config.pacejka.C;
      const D = this.config.pacejka.D * this.load;
      const E = this.config.pacejka.E;
      
      // Lateral force
      const alphaInput = B * this.slipAngle;
      const lateralForce = D * Math.sin(C * Math.atan(alphaInput - E * (alphaInput - Math.atan(alphaInput))));
      
      // Longitudinal force
      const kappaInput = B * this.slipRatio;
      const longitudinalForce = D * Math.sin(C * Math.atan(kappaInput - E * (kappaInput - Math.atan(kappaInput))));
      
      // Surface friction modifier
      const surfaceFriction = this.getSurfaceFriction();
      
      // Combine forces (friction circle)
      const totalDemand = Math.sqrt(lateralForce * lateralForce + longitudinalForce * longitudinalForce);
      const maxForce = this.load * surfaceFriction;
      const forceFactor = totalDemand > maxForce ? maxForce / totalDemand : 1;
      
      // Apply friction circle limitation
      const finalLateral = lateralForce * forceFactor;
      const finalLongitudinal = longitudinalForce * forceFactor;
      
      // Check if skidding
      this.skidding = forceFactor < 0.9 || Math.abs(this.slipAngle) > 0.2 || Math.abs(this.slipRatio) > 0.2;
      
      // Transform forces back to world coordinates
      const force = new Vector3(finalLateral, 0, finalLongitudinal).rotate2D(tireAngle);
      
      // Calculate torque on car (moment about CG)
      const momentArm = this.position.subtract(new Vector3(0, 0, 0)); // CG at origin
      const torque = momentArm.cross(force).y;
      
      return { force, torque };
    }
    
    getSurfaceFriction() {
      // Surface-specific friction coefficients
      const frictions = {
        asphalt: 0.9,
        wet: 0.7,
        dirt: 0.6,
        ice: 0.3,
        sand: 0.5,
      };
      return frictions[this.surfaceType] || 0.9;
    }
    
    updateSuspension(groundHeight, carVelocity, deltaTime) {
      const restHeight = this.position.y - this.config.radius - PHYSICS_CONFIG.suspension.restLength;
      const currentCompression = restHeight - groundHeight;
      
      // Limit compression
      this.compression = Math.max(0, Math.min(PHYSICS_CONFIG.suspension.maxTravel, currentCompression));
      
      // Calculate spring force
      const springForce = this.compression * PHYSICS_CONFIG.suspension.springRate;
      
      // Calculate damper force
      this.compressionVelocity = (this.compression - this.previousCompression || 0) / deltaTime;
      const damperForce = this.compressionVelocity * PHYSICS_CONFIG.suspension.damperRate;
      
      this.previousCompression = this.compression;
      
      // Total suspension force (upward)
      const suspensionForce = springForce + damperForce;
      
      // Set contact patch if wheel touches ground
      this.contactPatch = this.compression > 0 ? { height: groundHeight } : null;
      
      return suspensionForce;
    }
  }

  class CarPhysics {
    constructor(initialState = {}) {
      // Position and orientation
      this.position = new Vector3(initialState.x || 0, initialState.y || 0.5, initialState.z || 0);
      this.rotation = new Vector3(0, initialState.angle || 0, 0); // Euler angles
      this.velocity = new Vector3();
      this.angularVelocity = new Vector3();
      
      // Forces and torques
      this.force = new Vector3();
      this.torque = new Vector3();
      
      // Controls
      this.throttle = 0;
      this.brake = 0;
      this.handbrake = 0;
      this.steerInput = 0;
      this.steerAngle = 0;
      
      // Transmission
      this.gear = 1; // Start in 1st gear
      this.clutch = 1; // 1 = engaged, 0 = disengaged
      this.engineRPM = PHYSICS_CONFIG.engine.idleRPM;
      
      // Create tires
      this.tires = {
        frontLeft: new Tire(
          new Vector3(-PHYSICS_CONFIG.car.trackWidth/2, 0, PHYSICS_CONFIG.car.cgToFront),
          PHYSICS_CONFIG.tire
        ),
        frontRight: new Tire(
          new Vector3(PHYSICS_CONFIG.car.trackWidth/2, 0, PHYSICS_CONFIG.car.cgToFront),
          PHYSICS_CONFIG.tire
        ),
        rearLeft: new Tire(
          new Vector3(-PHYSICS_CONFIG.car.trackWidth/2, 0, -PHYSICS_CONFIG.car.cgToRear),
          PHYSICS_CONFIG.tire
        ),
        rearRight: new Tire(
          new Vector3(PHYSICS_CONFIG.car.trackWidth/2, 0, -PHYSICS_CONFIG.car.cgToRear),
          PHYSICS_CONFIG.tire
        ),
      };
      
      // Accumulator for fixed timestep
      this.accumulator = 0;
    }
    
    update(deltaTime, groundHeightFunction) {
      // Accumulate time for fixed timestep
      this.accumulator += deltaTime;
      
      let steps = 0;
      while (this.accumulator >= PHYSICS_CONFIG.fixedTimeStep && steps < PHYSICS_CONFIG.maxSubSteps) {
        this.fixedUpdate(PHYSICS_CONFIG.fixedTimeStep, groundHeightFunction);
        this.accumulator -= PHYSICS_CONFIG.fixedTimeStep;
        steps++;
      }
    }
    
    fixedUpdate(dt, groundHeightFunction) {
      // Reset forces
      this.force = new Vector3();
      this.torque = new Vector3();
      
      // Update steering
      this.updateSteering(dt);
      
      // Update each tire
      let totalSuspensionForce = 0;
      const tireForces = [];
      
      for (const [name, tire] of Object.entries(this.tires)) {
        // Get ground height at tire position
        const tireWorldPos = this.localToWorld(tire.position);
        const groundHeight = groundHeightFunction(tireWorldPos.x, tireWorldPos.z);
        
        // Update suspension
        const suspensionForce = tire.updateSuspension(groundHeight, this.velocity, dt);
        totalSuspensionForce += suspensionForce;
        
        // Update tire load
        tire.updateLoad(
          PHYSICS_CONFIG.car.mass,
          PHYSICS_CONFIG.car.cgHeight,
          this.getAcceleration(),
          this.getLateralAcceleration()
        );
        
        // Calculate tire forces
        const tireVelocity = this.getVelocityAtPoint(tire.position);
        const { force, torque } = tire.calculateForces(tireVelocity, this.angularVelocity.y, this.steerAngle);
        
        tireForces.push({ tire, force, torque });
      }
      
      // Apply tire forces
      for (const { force, torque } of tireForces) {
        this.force = this.force.add(force);
        this.torque = this.torque.add(new Vector3(0, torque, 0));
      }
      
      // Update engine and transmission
      this.updateDrivetrain(dt);
      
      // Apply aerodynamic forces
      this.applyAerodynamics();
      
      // Apply gravity
      this.force = this.force.add(new Vector3(0, -PHYSICS_CONFIG.car.mass * PHYSICS_CONFIG.gravity, 0));
      
      // Apply suspension forces
      this.force = this.force.add(new Vector3(0, totalSuspensionForce, 0));
      
      // Integrate motion
      this.integrateMotion(dt);
    }
    
    updateSteering(dt) {
      const targetAngle = this.steerInput * PHYSICS_CONFIG.steering.maxAngle;
      const steerSpeed = this.steerInput !== 0 ? PHYSICS_CONFIG.steering.speed : PHYSICS_CONFIG.steering.returnSpeed;
      
      // Smooth steering
      const steerDelta = targetAngle - this.steerAngle;
      const maxChange = steerSpeed * dt;
      this.steerAngle += Math.sign(steerDelta) * Math.min(Math.abs(steerDelta), maxChange);
      
      // Speed-sensitive steering reduction
      const speedFactor = 1 / (1 + this.velocity.magnitude() * 0.02);
      this.steerAngle *= speedFactor;
    }
    
    updateDrivetrain(dt) {
      // Calculate wheel speed from rear tires (RWD)
      const rearWheelSpeed = (this.tires.rearLeft.angularVelocity + this.tires.rearRight.angularVelocity) / 2;
      
      // Calculate engine RPM through transmission
      const gearRatio = PHYSICS_CONFIG.engine.gearRatios[this.gear] || 1;
      const totalRatio = gearRatio * PHYSICS_CONFIG.engine.finalDrive;
      const targetRPM = Math.abs(rearWheelSpeed) * totalRatio * 60 / (2 * Math.PI);
      
      // Engine RPM with inertia
      const rpmDelta = targetRPM - this.engineRPM;
      this.engineRPM += rpmDelta * this.clutch * dt * 10; // Clutch engagement affects RPM matching
      
      // Limit RPM
      this.engineRPM = Math.max(PHYSICS_CONFIG.engine.idleRPM, 
        Math.min(PHYSICS_CONFIG.engine.maxRPM, this.engineRPM));
      
      // Calculate engine torque
      let engineTorque = 0;
      if (this.throttle > 0 && this.gear !== 0) { // Not in neutral
        const normalizedRPM = this.engineRPM / PHYSICS_CONFIG.engine.maxRPM;
        // Simple torque curve (peaks at 0.7 of max RPM)
        const torqueFactor = -2 * normalizedRPM * normalizedRPM + 2.8 * normalizedRPM;
        engineTorque = PHYSICS_CONFIG.engine.maxTorque * torqueFactor * this.throttle;
      }
      
      // Apply through transmission to rear wheels
      const wheelTorque = engineTorque * totalRatio * this.clutch * PHYSICS_CONFIG.engine.efficiency;
      
      // Apply brake torque
      let brakeTorque = 0;
      if (this.brake > 0) {
        brakeTorque = -PHYSICS_CONFIG.brakes.maxForce * this.brake * PHYSICS_CONFIG.tire.radius;
      }
      if (this.handbrake > 0) {
        // Handbrake only on rear wheels
        const rearBrakeTorque = -PHYSICS_CONFIG.brakes.handbrakeForce * this.handbrake * PHYSICS_CONFIG.tire.radius;
        this.tires.rearLeft.angularVelocity += rearBrakeTorque * dt / PHYSICS_CONFIG.tire.mass;
        this.tires.rearRight.angularVelocity += rearBrakeTorque * dt / PHYSICS_CONFIG.tire.mass;
      }
      
      // Update wheel angular velocities
      // Drive torque to rear wheels only (RWD)
      const torquePerWheel = wheelTorque / 2;
      this.tires.rearLeft.angularVelocity += torquePerWheel * dt / PHYSICS_CONFIG.tire.mass;
      this.tires.rearRight.angularVelocity += torquePerWheel * dt / PHYSICS_CONFIG.tire.mass;
      
      // Brake torque to all wheels
      const brakePerWheel = brakeTorque / 4;
      for (const tire of Object.values(this.tires)) {
        tire.angularVelocity += brakePerWheel * dt / PHYSICS_CONFIG.tire.mass;
      }
    }
    
    applyAerodynamics() {
      const velocity = this.velocity.magnitude();
      if (velocity < 0.1) return;
      
      // Drag force
      const dragForce = 0.5 * PHYSICS_CONFIG.airDensity * PHYSICS_CONFIG.aero.dragCoefficient * 
        PHYSICS_CONFIG.aero.frontalArea * velocity * velocity;
      
      const dragDirection = this.velocity.normalize().multiply(-1);
      this.force = this.force.add(dragDirection.multiply(dragForce));
      
      // Downforce (simplified)
      const downforce = 0.5 * PHYSICS_CONFIG.airDensity * PHYSICS_CONFIG.aero.downforceCoefficient * 
        PHYSICS_CONFIG.aero.frontalArea * velocity * velocity;
      
      this.force = this.force.add(new Vector3(0, -downforce, 0));
    }
    
    integrateMotion(dt) {
      // Linear motion
      const acceleration = this.force.multiply(1 / PHYSICS_CONFIG.car.mass);
      this.velocity = this.velocity.add(acceleration.multiply(dt));
      this.position = this.position.add(this.velocity.multiply(dt));
      
      // Angular motion (simplified to yaw only for now)
      const angularAcceleration = this.torque.y / PHYSICS_CONFIG.car.momentOfInertia;
      this.angularVelocity.y += angularAcceleration * dt;
      this.rotation.y += this.angularVelocity.y * dt;
      
      // Apply damping
      this.velocity = this.velocity.multiply(0.999);
      this.angularVelocity = this.angularVelocity.multiply(0.995);
    }
    
    localToWorld(localPos) {
      // Rotate by car's yaw
      const rotated = localPos.rotate2D(this.rotation.y);
      return this.position.add(rotated);
    }
    
    getVelocityAtPoint(localPos) {
      // Linear velocity + rotational velocity
      const angularComponent = new Vector3(-localPos.z * this.angularVelocity.y, 0, localPos.x * this.angularVelocity.y);
      return this.velocity.add(angularComponent);
    }
    
    getAcceleration() {
      return this.force.multiply(1 / PHYSICS_CONFIG.car.mass);
    }
    
    getLateralAcceleration() {
      // Project velocity perpendicular to car direction
      const carDirection = new Vector3(Math.sin(this.rotation.y), 0, Math.cos(this.rotation.y));
      const lateralDirection = new Vector3(Math.cos(this.rotation.y), 0, -Math.sin(this.rotation.y));
      const lateralVelocity = this.velocity.dot(lateralDirection);
      
      // Centripetal acceleration
      const speed = this.velocity.magnitude();
      if (speed > 0.1 && Math.abs(this.angularVelocity.y) > 0.01) {
        const radius = speed / Math.abs(this.angularVelocity.y);
        return speed * speed / radius;
      }
      return 0;
    }
    
    setControls(controls) {
      this.throttle = Math.max(0, Math.min(1, controls.throttle || 0));
      this.brake = Math.max(0, Math.min(1, controls.brake || 0));
      this.handbrake = Math.max(0, Math.min(1, controls.handbrake || 0));
      this.steerInput = Math.max(-1, Math.min(1, controls.steer || 0));
      
      // Gear changes
      if (controls.gearUp && this.gear < PHYSICS_CONFIG.engine.gearRatios.length - 2) {
        this.gear++;
        this.clutch = 0; // Disengage clutch during shift
      }
      if (controls.gearDown && this.gear > -1) {
        this.gear--;
        this.clutch = 0;
      }
      
      // Re-engage clutch
      if (this.clutch < 1) {
        this.clutch = Math.min(1, this.clutch + 0.05); // Gradual engagement
      }
    }
    
    getState() {
      return {
        position: this.position,
        rotation: this.rotation,
        velocity: this.velocity,
        angularVelocity: this.angularVelocity,
        engineRPM: this.engineRPM,
        gear: this.gear,
        speed: this.velocity.magnitude(),
        tires: Object.entries(this.tires).reduce((acc, [name, tire]) => {
          acc[name] = {
            compression: tire.compression,
            load: tire.load,
            slipAngle: tire.slipAngle,
            slipRatio: tire.slipRatio,
            skidding: tire.skidding,
            contactPatch: tire.contactPatch,
          };
          return acc;
        }, {})
      };
    }
  }

  // Export for use in main game
  window.CarPhysicsEngine = {
    CarPhysics,
    Vector3,
    PHYSICS_CONFIG
  };
})();