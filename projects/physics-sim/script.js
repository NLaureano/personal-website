// ============================================================================
// VECTOR MODULE - Basic 2D Vector Math
// ============================================================================
const Vector = {
    create: (x = 0, y = 0) => ({ x, y }),
    
    add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
    subtract: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
    multiply: (v, scalar) => ({ x: v.x * scalar, y: v.y * scalar }),
    
    magnitude: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
    normalize: (v) => {
        const mag = Vector.magnitude(v);
        return mag === 0 ? { x: 0, y: 0 } : { x: v.x / mag, y: v.y / mag };
    },
    
    dot: (v1, v2) => v1.x * v2.x + v1.y * v2.y,
    distance: (p1, p2) => Vector.magnitude(Vector.subtract(p2, p1))
};

const Particle = {
    create: (position, velocity, mass, radius) => ({
        position,
        velocity,
        inverseMass : mass === 0 ? 0 : 1 / mass,
        radius,
        isColliding: false,
    }),

    applyForce: (particle, force, deltaTime) => {
        if (particle.inverseMass === 0) return; // Infinite mass (immovable)
        // acceleration = force x inverseMass
        const acceleration = Vector.multiply(force, particle.inverseMass);
        // Velocity = velocity + (acceleration x deltaTime)
        particle.velocity = Vector.add(particle.velocity, Vector.multiply(acceleration, deltaTime));
        // Thus,
        // Velocity = velocity + ((force x inverseMass) x deltaTime)
    },

    update: (particle, deltaTime) => {
        // Update position based on velocity: position += velocity * deltaTime
        particle.position = Vector.add(particle.position, Vector.multiply(particle.velocity, deltaTime));
    }
}

// ============================================================================
// PHYSICS CORE MODULE - World State & Physics Calculations
// ============================================================================
// RESPONSIBILITY: Manage particle state and perform physics calculations
// 
// DATA FLOW IN:
//   - From Simulation Loop: deltaTime (for update step)
//   - From Renderer: user interactions (mouse clicks, constraints)
//
// DATA FLOW OUT:
//   - To Renderer: Updated particle positions and velocities for drawing
//   - To Simulation Loop: None (Renderer reads directly from particles)
//
// KEY METHODS TO IMPLEMENT:
//   - addParticle(position, velocity, mass, radius): Add particle to world
//   - update(deltaTime): Apply forces, update velocities, update positions
//   - getParticles(): Return array of all particles for Renderer
//   - applyConstraints(): Handle collisions, boundary conditions
const PhysicsCore = (() => {
    let particles = [];
    const gravity = Vector.create(0, 500); // Gravitational acceleration in pixels/s²
    const damping = 0.998;
    let canvasWidth = 800;
    let canvasHeight = 600;
    const restitution = 0.8; // Bounce elasticity (0-1)


    function addParticle(position, velocity, mass, radius) {
        particles.push(Particle.create(position, velocity, mass, radius))
    };

    function setBoundarySize(dimensions) {
        canvasWidth = dimensions.width;
        canvasHeight = dimensions.height;
    };

    function update(deltaTime) {
        // Reset collision state
        particles.forEach(p => p.isColliding = false);
        
        particles.forEach((p) => {
            // Apply gravity as acceleration (not force), so all objects fall at same rate
            if (p.inverseMass > 0) { // Only apply to movable objects
                p.velocity = Vector.add(p.velocity, Vector.multiply(gravity, deltaTime));
            }
            p.velocity = Vector.multiply(p.velocity, damping)
            Particle.update(p, deltaTime);
            applyConstraints(p)
        });
        
        // Check all particle pairs for collisions
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                checkCollision(particles[i], particles[j]);
            }
        }
    };

    function checkCollision(p, q) {
        // Collision detection and response logic goes here
        const pPos = Vector.create(p.position.x, p.position.y);
        const qPos = Vector.create(q.position.x, q.position.y);
        const rp = p.radius;
        const rq = q.radius;
        const distance_magnitude = Vector.magnitude(Vector.subtract(pPos, qPos));
        const overlap =  (rp + rq) - distance_magnitude; // True Overlap is positive
        if (overlap > 0){
            // n_hat = (p_pos - q_pos) / (distance_magnitude)
            const collisionNormal = Vector.multiply(Vector.subtract(pPos, qPos), 1/distance_magnitude);

            // Relative Velocity (v_rel) = p_velocity - q_velocity
            const relativeVelocity = Vector.subtract(p.velocity, q.velocity);

            // Normal Component of the Relative Velocity
            // v_n = v_rel * n_hat
            const v_n = Vector.dot(relativeVelocity, collisionNormal);

            //Check for colliding/ moving towards each other i.e. v_n < 0
            if (v_n < 0) {
                const e = restitution

                const invMassSum = p.inverseMass + q.inverseMass;
                if (invMassSum === 0) return;
                const j = -(1 + e) * v_n / invMassSum;

                // Impulse Vector
                J = Vector.multiply(collisionNormal, j)

                p.velocity = Vector.add(p.velocity, Vector.multiply(J, p.inverseMass))
                
                q.velocity = Vector.subtract(q.velocity, Vector.multiply(J, q.inverseMass))
                
                // Positional correction - separate particles to prevent sinking
                const slop = 0.01; // Small offset to prevent re-collision
                const correctionMagnitude = Math.max(overlap - slop, 0) / invMassSum;
                const correction = Vector.multiply(collisionNormal, correctionMagnitude);
                
                p.position = Vector.add(p.position, Vector.multiply(correction, p.inverseMass));
                q.position = Vector.subtract(q.position, Vector.multiply(correction, q.inverseMass));
                
                // Mark particles as colliding for visual feedback
                p.isColliding = true;
                q.isColliding = true;
            }

        }
    }

    function getParticles() {
        return particles;
    };

    function getParticleCount() {
        return particles.length;
    };

    function clearParticles() {
        particles.length = 0;
    };

    function applyConstraints(particle) {
        // Boundary constraints - bounce particles off canvas edges
        
        // Left and right boundaries
        if (particle.position.x - particle.radius < 0) {
            particle.position.x = particle.radius;
            particle.velocity.x *= -restitution;
        } else if (particle.position.x + particle.radius > canvasWidth) {
            particle.position.x = canvasWidth - particle.radius;
            particle.velocity.x *= -restitution;
        }
        
        // Top and bottom boundaries
        if (particle.position.y - particle.radius < 0) {
            particle.position.y = particle.radius;
            particle.velocity.y *= -restitution;
        } else if (particle.position.y + particle.radius > canvasHeight) {
            particle.position.y = canvasHeight - particle.radius;
            particle.velocity.y *= -restitution;
        }
    }

    // Collision handling removed (resetting collision system)
    
    return {
        addParticle,
        setBoundarySize,
        update,
        getParticles,
        applyConstraints,
        getParticleCount,
        clearParticles
    };
})();

// ============================================================================
// RENDERER MODULE - Canvas Rendering
// ============================================================================
// RESPONSIBILITY: Draw particles and world state to canvas
//
// DATA FLOW IN:
//   - From PhysicsCore: Particle array (positions, radii, velocities)
//   - From Simulation Loop: Canvas context, screen dimensions
//
// DATA FLOW OUT:
//   - To Simulation Loop: User interaction events (mouse position, clicks)
//   - To PhysicsCore: Via callbacks for interactive constraints
//
// KEY METHODS TO IMPLEMENT:
//   - initialize(canvas): Set up canvas and rendering context
//   - render(particles): Draw all particles to canvas
//   - clear(): Clear canvas for next frame
//   - setupMouseTracking(): Handle user input and pass to PhysicsCore
const Renderer = (() => {
    let canvas;
    let ctx;
    
    function initialize(canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext('2d');
    }
    
    function clear() {
        ctx.fillStyle = '#140528cc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    function render(particles) {
        particles.forEach((p) => {
            // Draw particle (red if colliding, white otherwise)
            ctx.fillStyle = p.isColliding ? '#ff0000' : '#ffffff';
            ctx.beginPath();
            ctx.arc(p.position.x, p.position.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw velocity arrow
            const velocityMagnitude = Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y);
            if (velocityMagnitude > 0) {
                const arrowScale = 0.1; // Scale factor for arrow length
                const arrowLength = velocityMagnitude * arrowScale;
                const arrowEndX = p.position.x + p.velocity.x * arrowScale;
                const arrowEndY = p.position.y + p.velocity.y * arrowScale;
                
                // Draw arrow line
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(p.position.x, p.position.y);
                ctx.lineTo(arrowEndX, arrowEndY);
                ctx.stroke();
                
                // Draw arrowhead
                const headLength = Math.min(arrowLength * 0.3, 10);
                const angle = Math.atan2(p.velocity.y, p.velocity.x);
                
                ctx.beginPath();
                ctx.moveTo(arrowEndX, arrowEndY);
                ctx.lineTo(
                    arrowEndX - headLength * Math.cos(angle - Math.PI / 6),
                    arrowEndY - headLength * Math.sin(angle - Math.PI / 6)
                );
                ctx.moveTo(arrowEndX, arrowEndY);
                ctx.lineTo(
                    arrowEndX - headLength * Math.cos(angle + Math.PI / 6),
                    arrowEndY - headLength * Math.sin(angle + Math.PI / 6)
                );
                ctx.stroke();
            }
        });
    }

    function clickHandler(onCanvasClick) {
        canvas.addEventListener('click', (event) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;  
            const scaleY = canvas.height / rect.height;
            const x = (event.clientX - rect.left) * scaleX;
            const y = (event.clientY - rect.top) * scaleY;
            onCanvasClick(Vector.create(x, y));
        })
    }

    function getCanvasDim() {
        return {
            width: canvas.width,
            height: canvas.height
        };
    }
    
    return {
        initialize,
        clear,
        render,
        clickHandler,
        getCanvasDim
    };
})();
// ============================================================================
// MAIN SIMULATION LOOP
// ============================================================================
// ARCHITECTURE & DATA FLOW:
//
// 1. INITIALIZATION (once):
//    - Get canvas element from DOM
//    - Call Renderer.initialize(canvas)
//    - Call PhysicsCore initialization (add particles to world)
//    - Start requestAnimationFrame loop
//
// 2. PER-FRAME LOOP (requestAnimationFrame):
//    - Calculate deltaTime since last frame
//    - Call PhysicsCore.update(deltaTime) → updates all particle physics
//    - Call Renderer.clear() → clears canvas
//    - Call Renderer.render(PhysicsCore.getParticles()) → draws updated state
//
// 3. EVENT COMMUNICATION:
//    - Renderer detects mouse input → calls callbacks to add constraints
//    - PhysicsCore applies physics → updates particle positions
//    - Renderer uses updated positions for next frame draw
//
// PSEUDOCODE:
// let lastTime = Date.now();
// function loop() {
//   const currentTime = Date.now();
//   const deltaTime = (currentTime - lastTime) / 1000; // convert to seconds
//   lastTime = currentTime;
//
//   PhysicsCore.update(deltaTime);
//   Renderer.clear();
//   Renderer.render(PhysicsCore.getParticles());
//
//   requestAnimationFrame(loop);
// }
window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('simCanvas');
    const particleCounter = document.getElementById('particleCounter');
    const speedValue = document.getElementById('speedValue');
    let speed = 1.0; // Default speed
    const resetButton = document.getElementById('resetButton');
    
    // Particle spawn controls
    const massInput = document.getElementById('massInput');
    const radiusInput = document.getElementById('radiusInput');
    const velocityXInput = document.getElementById('velocityXInput');
    const velocityYInput = document.getElementById('velocityYInput');
    const speedButtons = document.querySelectorAll('.speed-btn');
    
    // Update speed when speed button is clicked
    speedButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            speed = parseFloat(event.target.dataset.speed);
            speedValue.textContent = speed.toFixed(1);
            
            // Update active button state
            speedButtons.forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
        });
    });
    
    resetButton.addEventListener('click', () => {
        PhysicsCore.clearParticles();
        particleCounter.textContent = PhysicsCore.getParticleCount()
    });
    
    // Add event listeners for +/- buttons (click and hold support)
    let holdInterval = null;
    let holdTimeout = null;
    
    function incrementDecrementValue(targetId, isIncrement) {
        const input = document.getElementById(targetId);
        const step = parseFloat(input.step) || 1;
        
        if (isIncrement) {
            input.value = parseFloat(input.value) + step;
        } else {
            const newValue = parseFloat(input.value) - step;
            // Only apply min constraint if the input has a min attribute
            if (input.hasAttribute('min')) {
                const min = parseFloat(input.min);
                input.value = Math.max(newValue, min);
            } else {
                input.value = newValue;
            }
        }
    }
    
    document.querySelectorAll('.input-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.target.dataset.target;
            const isIncrement = event.target.classList.contains('plus');
            incrementDecrementValue(targetId, isIncrement);
        });
        
        button.addEventListener('mousedown', (event) => {
            const targetId = event.target.dataset.target;
            const isIncrement = event.target.classList.contains('plus');
            
            // Initial delay before continuous increment starts
            holdTimeout = setTimeout(() => {
                holdInterval = setInterval(() => {
                    incrementDecrementValue(targetId, isIncrement);
                }, 50); // Increment every 50ms while held
            }, 300); // Wait 300ms before starting continuous increment
        });
        
        button.addEventListener('touchstart', (event) => {
            const targetId = event.target.dataset.target;
            const isIncrement = event.target.classList.contains('plus');
            
            holdTimeout = setTimeout(() => {
                holdInterval = setInterval(() => {
                    incrementDecrementValue(targetId, isIncrement);
                }, 50);
            }, 300);
        });
    });
    
    // Stop incrementing when mouse is released or touch ends
    document.addEventListener('mouseup', () => {
        clearTimeout(holdTimeout);
        clearInterval(holdInterval);
        holdTimeout = null;
        holdInterval = null;
    });
    
    document.addEventListener('touchend', () => {
        clearTimeout(holdTimeout);
        clearInterval(holdInterval);
        holdTimeout = null;
        holdInterval = null;
    });

    // Initialize renderer
    Renderer.initialize(canvas);
    
    // Set boundary size for physics calculations
    PhysicsCore.setBoundarySize(Renderer.getCanvasDim());
    
    // Add five large particles across the middle of the screen
    const middleY = 300;
    const xPositions = [133, 400, 666];
    const masses = [100, 200, 500]
    xPositions.forEach((x, index) => {
        PhysicsCore.addParticle(Vector.create(x, middleY), Vector.create(0, 0), masses[index], 50);
    });
    particleCounter.textContent = PhysicsCore.getParticleCount()
    
    Renderer.clickHandler((position) => {
        const mass = parseFloat(massInput.value) || 1;
        const radius = parseFloat(radiusInput.value) || 8;
        const velocityX = parseFloat(velocityXInput.value) || 0;
        const velocityY = parseFloat(velocityYInput.value) || 0;
        
        PhysicsCore.addParticle(position, Vector.create(velocityX, velocityY), mass, radius);
        particleCounter.textContent = PhysicsCore.getParticleCount()
    });

    

    // Main simulation loop (fixed 60 FPS physics)
    let lastTime = Date.now();
    let accumulator = 0;
    const fixedTimestep = 1 / 60; // 60 FPS physics
    const maxStepsPerFrame = 5; // Prevent spiral of death

    function loop() {
        const currentTime = Date.now();
        let frameTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        // Cap max frame time to prevent tunneling
        frameTime = Math.min(frameTime, 0.1);

        // Apply time scale from speed slider
        accumulator += frameTime * speed;

        let stepCount = 0;
        while (accumulator >= fixedTimestep && stepCount < maxStepsPerFrame) {
            PhysicsCore.update(fixedTimestep);
            accumulator -= fixedTimestep;
            stepCount++;
        }

        Renderer.clear();
        Renderer.render(PhysicsCore.getParticles());

        requestAnimationFrame(loop);
    }

    loop();
});
