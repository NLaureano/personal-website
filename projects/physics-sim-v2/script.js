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
    distance: (p1, p2) => Vector.magnitude(Vector.subtract(p2, p1)),
    cross2D: (scalar, v) => ({ x: -scalar * v.y, y: scalar * v.x }),
    cross2DScalar: (v1, v2) => v1.x * v2.y - v1.y * v2.x
};

const Particle = {
    create: (position, velocity, mass, radius, shape = 'circle') => {
        const inverseMass = mass === 0 ? 0 : 1 / mass;
        let momentOfInertia = 0;
        let inverseMomentOfInertia = 0;

        if (mass > 0) {
            if (shape === 'circle') {
                momentOfInertia = 0.5 * mass * radius * radius;
            } else {
                momentOfInertia = (2 / 3) * mass * radius * radius;
            }
            inverseMomentOfInertia = 1 / momentOfInertia;
        }

        return {
            position,
            velocity,
            inverseMass,
            radius,
            shape, // 'circle' or 'square'
            rotation: 0, // Current rotation in radians
            rotationalVelocity: shape === 'square' ? 0 : (Math.random() - 0.5) * 4,
            momentOfInertia,
            inverseMomentOfInertia,
            isColliding: false,
        };
    },

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
    const staticFriction = 0.7;
    const dynamicFriction = 0.5;
    const baumgarteBeta = 0.2;
    const solverIterations = 6;
    const restitutionVelocityThreshold = 35;
    const sleepLinearThreshold = 4;
    const sleepAngularThreshold = 0.12;


    function addParticle(position, velocity, mass, radius, shape = 'circle') {
        particles.push(Particle.create(position, velocity, mass, radius, shape))
    };

    function setBoundarySize(dimensions) {
        canvasWidth = dimensions.width;
        canvasHeight = dimensions.height;
    };

    function update(deltaTime) {
        // Reset collision state
        particles.forEach(p => p.isColliding = false);
        
        particles.forEach((p) => {
            // Apply drag force if particle is being dragged
            if (p.dragTarget && p.inverseMass > 0) {
                const dragSpringConstant = 1200; // Spring stiffness for drag
                const dragDamping = 0.9; // Damping factor to prevent oscillation
                
                const displacement = Vector.subtract(p.dragTarget, p.position);
                const distance = Vector.magnitude(displacement);
                
                // Apply spring force toward target
                if (distance > 0.1) {
                    const springForce = Vector.multiply(displacement, dragSpringConstant * p.inverseMass);
                    p.velocity = Vector.add(p.velocity, Vector.multiply(springForce, deltaTime));
                    // Apply some damping to prevent overshoot
                    p.velocity = Vector.multiply(p.velocity, dragDamping);
                }
            }

            // Apply gravity as acceleration (not force), so all objects fall at same rate
            if (p.inverseMass > 0) { // Only apply to movable objects
                p.velocity = Vector.add(p.velocity, Vector.multiply(gravity, deltaTime));
            }
            p.velocity = Vector.multiply(p.velocity, damping)
            p.rotationalVelocity *= damping;
            // Update rotation based on rotational velocity
            p.rotation += p.rotationalVelocity * deltaTime;
            Particle.update(p, deltaTime);
            applyConstraints(p)
        });

        // Iterative collision solving improves resting stacks and reduces jitter
        for (let iteration = 0; iteration < solverIterations; iteration++) {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    checkCollision(particles[i], particles[j], deltaTime);
                }
            }
        }

        // Sleep clamp for tiny residual motion at rest
        particles.forEach((p) => {
            if (!p.isColliding) return;

            if (Math.abs(p.velocity.x) < sleepLinearThreshold) p.velocity.x = 0;
            if (Math.abs(p.velocity.y) < sleepLinearThreshold) p.velocity.y = 0;
            if (Math.abs(p.rotationalVelocity) < sleepAngularThreshold) p.rotationalVelocity = 0;
        });
    };

    function getDistanceToCentroid(particle, directionVector) {
        // Returns the distance from particle center to edge in the given direction
        // Accounts for shape and rotation
        if (particle.shape === 'circle') {
            return particle.radius;
        } else if (particle.shape === 'square') {
            // Calculate the direction angle
            let angle = Math.atan2(directionVector.y, directionVector.x);
            
            // Adjust for the particle's rotation
            angle -= particle.rotation;
            
            // Map to [0, π/2) using modulo due to 4-fold symmetry of square
            angle = angle % (Math.PI / 2);
            if (angle < 0) angle += Math.PI / 2;
            
            // For a square with "radius" r (half side length):
            // - At angle 0 or π/2 (aligned with edges): distance = r / cos(0) = r
            // - At angle π/4 (diagonal): distance = r / cos(π/4) = r * sqrt(2)
            const r = particle.radius;
            if (angle <= Math.PI / 4) {
                return r / Math.cos(angle);
            } else {
                return r / Math.sin(angle);
            }
        }
    }

    function getSupportPointLocalToWorld(particle, directionNorm) {
        if (particle.shape === 'circle') {
            return Vector.multiply(directionNorm, particle.radius);
        }

        const cos = Math.cos(particle.rotation);
        const sin = Math.sin(particle.rotation);

        const localDir = Vector.create(
            directionNorm.x * cos + directionNorm.y * sin,
            -directionNorm.x * sin + directionNorm.y * cos
        );

        const r = particle.radius;
        let localPoint;

        if (Math.abs(localDir.x) >= Math.abs(localDir.y)) {
            const sx = localDir.x >= 0 ? 1 : -1;
            const y = Math.max(-r, Math.min(r, sx * r * (localDir.y / Math.max(Math.abs(localDir.x), 1e-8))));
            localPoint = Vector.create(sx * r, y);
        } else {
            const sy = localDir.y >= 0 ? 1 : -1;
            const x = Math.max(-r, Math.min(r, sy * r * (localDir.x / Math.max(Math.abs(localDir.y), 1e-8))));
            localPoint = Vector.create(x, sy * r);
        }

        return Vector.create(
            localPoint.x * cos - localPoint.y * sin,
            localPoint.x * sin + localPoint.y * cos
        );
    }

    function getWallContactOffsets(particle, toWallDirection) {
        if (particle.shape === 'circle') {
            return [getSupportPointLocalToWorld(particle, toWallDirection)];
        }

        const vertices = getSquareVertices(particle);
        const relativeVertices = vertices.map(v => Vector.subtract(v, particle.position));
        const projections = relativeVertices.map(v => Vector.dot(v, toWallDirection));
        const maxProjection = Math.max(...projections);
        const epsilon = 0.5;

        const contacts = [];
        for (let i = 0; i < relativeVertices.length; i++) {
            if (maxProjection - projections[i] <= epsilon) {
                contacts.push(relativeVertices[i]);
            }
        }

        if (contacts.length === 0) {
            contacts.push(getSupportPointLocalToWorld(particle, toWallDirection));
        }

        return contacts.slice(0, 2);
    }

    function getSquareAxes(particle) {
        const cos = Math.cos(particle.rotation);
        const sin = Math.sin(particle.rotation);
        return [
            Vector.create(cos, sin),
            Vector.create(-sin, cos)
        ];
    }

    function getSquareVertices(particle) {
        const [axisX, axisY] = getSquareAxes(particle);
        const r = particle.radius;
        const cx = particle.position.x;
        const cy = particle.position.y;
        return [
            Vector.add(Vector.create(cx, cy), Vector.add(Vector.multiply(axisX, r), Vector.multiply(axisY, r))),
            Vector.add(Vector.create(cx, cy), Vector.add(Vector.multiply(axisX, -r), Vector.multiply(axisY, r))),
            Vector.add(Vector.create(cx, cy), Vector.add(Vector.multiply(axisX, -r), Vector.multiply(axisY, -r))),
            Vector.add(Vector.create(cx, cy), Vector.add(Vector.multiply(axisX, r), Vector.multiply(axisY, -r)))
        ];
    }

    function projectSquareOnAxis(particle, axis) {
        const [axisX, axisY] = getSquareAxes(particle);
        const centerProjection = Vector.dot(particle.position, axis);
        const projectedRadius = particle.radius * (Math.abs(Vector.dot(axis, axisX)) + Math.abs(Vector.dot(axis, axisY)));
        return {
            min: centerProjection - projectedRadius,
            max: centerProjection + projectedRadius
        };
    }

    function projectCircleOnAxis(particle, axis) {
        const centerProjection = Vector.dot(particle.position, axis);
        return {
            min: centerProjection - particle.radius,
            max: centerProjection + particle.radius
        };
    }

    function overlapOnAxis(p, q, axis) {
        const n = Vector.normalize(axis);
        const projP = p.shape === 'square' ? projectSquareOnAxis(p, n) : projectCircleOnAxis(p, n);
        const projQ = q.shape === 'square' ? projectSquareOnAxis(q, n) : projectCircleOnAxis(q, n);
        return Math.min(projP.max, projQ.max) - Math.max(projP.min, projQ.min);
    }

    function closestPointOnSquare(point, square) {
        const cos = Math.cos(square.rotation);
        const sin = Math.sin(square.rotation);
        const localX = (point.x - square.position.x) * cos + (point.y - square.position.y) * sin;
        const localY = -(point.x - square.position.x) * sin + (point.y - square.position.y) * cos;
        const clampedX = Math.max(-square.radius, Math.min(square.radius, localX));
        const clampedY = Math.max(-square.radius, Math.min(square.radius, localY));
        return Vector.create(
            square.position.x + clampedX * cos - clampedY * sin,
            square.position.y + clampedX * sin + clampedY * cos
        );
    }

    function pointInsideSquare(point, square) {
        const cos = Math.cos(square.rotation);
        const sin = Math.sin(square.rotation);
        const localX = (point.x - square.position.x) * cos + (point.y - square.position.y) * sin;
        const localY = -(point.x - square.position.x) * sin + (point.y - square.position.y) * cos;
        return Math.abs(localX) <= square.radius + 1e-6 && Math.abs(localY) <= square.radius + 1e-6;
    }

    function findCollisionDataSAT(p, q) {
        const axes = [];

        if (p.shape === 'square') axes.push(...getSquareAxes(p));
        if (q.shape === 'square') axes.push(...getSquareAxes(q));

        if (p.shape === 'circle' && q.shape === 'circle') {
            axes.push(Vector.subtract(q.position, p.position));
        } else if (p.shape === 'circle' && q.shape === 'square') {
            const closest = closestPointOnSquare(p.position, q);
            axes.push(Vector.subtract(p.position, closest));
        } else if (p.shape === 'square' && q.shape === 'circle') {
            const closest = closestPointOnSquare(q.position, p);
            axes.push(Vector.subtract(q.position, closest));
        }

        let minOverlap = Infinity;
        let collisionNormal = null;

        for (const axis of axes) {
            if (Vector.magnitude(axis) < 1e-8) continue;
            const n = Vector.normalize(axis);
            const overlap = overlapOnAxis(p, q, n);
            if (overlap <= 0) return null;
            if (overlap < minOverlap) {
                minOverlap = overlap;
                collisionNormal = n;
            }
        }

        if (!collisionNormal) return null;

        const centerDelta = Vector.subtract(q.position, p.position);
        if (Vector.dot(centerDelta, collisionNormal) < 0) {
            collisionNormal = Vector.multiply(collisionNormal, -1);
        }

        const contacts = [];

        if (p.shape === 'circle' && q.shape === 'circle') {
            contacts.push(Vector.add(p.position, Vector.multiply(collisionNormal, p.radius)));
        } else if (p.shape === 'circle' && q.shape === 'square') {
            contacts.push(closestPointOnSquare(p.position, q));
        } else if (p.shape === 'square' && q.shape === 'circle') {
            contacts.push(closestPointOnSquare(q.position, p));
        } else {
            const pVerts = getSquareVertices(p);
            const qVerts = getSquareVertices(q);

            for (const v of pVerts) {
                if (pointInsideSquare(v, q)) contacts.push(v);
            }
            for (const v of qVerts) {
                if (pointInsideSquare(v, p)) contacts.push(v);
            }

            if (contacts.length === 0) {
                const supportP = Vector.add(p.position, Vector.multiply(collisionNormal, getDistanceToCentroid(p, collisionNormal)));
                const supportQ = Vector.add(q.position, Vector.multiply(collisionNormal, -getDistanceToCentroid(q, Vector.multiply(collisionNormal, -1))));
                contacts.push(Vector.multiply(Vector.add(supportP, supportQ), 0.5));
            }
        }

        const uniqueContacts = [];
        for (const contact of contacts) {
            const exists = uniqueContacts.some(c => Vector.distance(c, contact) < 0.5);
            if (!exists) uniqueContacts.push(contact);
            if (uniqueContacts.length >= 2) break;
        }

        return {
            normal: collisionNormal,
            penetration: minOverlap,
            contacts: uniqueContacts
        };
    }

    function resolveCollisionWithManifold(p, q, manifold, deltaTime) {
        const normal = manifold.normal;
        const contacts = manifold.contacts;
        const contactCount = Math.max(1, contacts.length);

        for (const contact of contacts) {
            const r1 = Vector.subtract(contact, p.position);
            const r2 = Vector.subtract(contact, q.position);

            const v1Contact = Vector.add(p.velocity, Vector.cross2D(p.rotationalVelocity, r1));
            const v2Contact = Vector.add(q.velocity, Vector.cross2D(q.rotationalVelocity, r2));
            const relativeVelocity = Vector.subtract(v2Contact, v1Contact);
            const vRelN = Vector.dot(relativeVelocity, normal);

            const r1CrossN = Vector.cross2DScalar(r1, normal);
            const r2CrossN = Vector.cross2DScalar(r2, normal);

            const effectiveMass = p.inverseMass + q.inverseMass +
                (r1CrossN * r1CrossN) * p.inverseMomentOfInertia +
                (r2CrossN * r2CrossN) * q.inverseMomentOfInertia;

            if (effectiveMass === 0) continue;

            const penetrationSlop = 0.005;
            const penetrationBias = Math.max(manifold.penetration - penetrationSlop, 0) * (baumgarteBeta / Math.max(deltaTime, 1e-6));
            const effectiveRestitution = Math.abs(vRelN) < restitutionVelocityThreshold ? 0 : restitution;
            let j = (-(1 + effectiveRestitution) * vRelN + penetrationBias) / effectiveMass;
            if (j < 0) j = 0;
            j /= contactCount;

            const impulse = Vector.multiply(normal, j);

            p.velocity = Vector.subtract(p.velocity, Vector.multiply(impulse, p.inverseMass));
            q.velocity = Vector.add(q.velocity, Vector.multiply(impulse, q.inverseMass));

            p.rotationalVelocity -= (r1CrossN * j) * p.inverseMomentOfInertia;
            q.rotationalVelocity += (r2CrossN * j) * q.inverseMomentOfInertia;

            const v1After = Vector.add(p.velocity, Vector.cross2D(p.rotationalVelocity, r1));
            const v2After = Vector.add(q.velocity, Vector.cross2D(q.rotationalVelocity, r2));
            const relAfter = Vector.subtract(v2After, v1After);

            let tangent = Vector.subtract(relAfter, Vector.multiply(normal, Vector.dot(relAfter, normal)));
            const tangentMag = Vector.magnitude(tangent);
            if (tangentMag < 1e-8) continue;
            tangent = Vector.multiply(tangent, 1 / tangentMag);

            const r1CrossT = Vector.cross2DScalar(r1, tangent);
            const r2CrossT = Vector.cross2DScalar(r2, tangent);
            const tangentMass = p.inverseMass + q.inverseMass +
                (r1CrossT * r1CrossT) * p.inverseMomentOfInertia +
                (r2CrossT * r2CrossT) * q.inverseMomentOfInertia;

            if (tangentMass === 0) continue;

            const jt = -Vector.dot(relAfter, tangent) / tangentMass;
            const maxStatic = staticFriction * j;
            const frictionMagnitude = Math.abs(jt) <= maxStatic ? jt : -Math.sign(Vector.dot(relAfter, tangent)) * dynamicFriction * j;
            const frictionImpulse = Vector.multiply(tangent, frictionMagnitude);

            p.velocity = Vector.subtract(p.velocity, Vector.multiply(frictionImpulse, p.inverseMass));
            q.velocity = Vector.add(q.velocity, Vector.multiply(frictionImpulse, q.inverseMass));

            p.rotationalVelocity -= Vector.cross2DScalar(r1, frictionImpulse) * p.inverseMomentOfInertia;
            q.rotationalVelocity += Vector.cross2DScalar(r2, frictionImpulse) * q.inverseMomentOfInertia;
        }

        const slop = 0.01;
        const invMassSum = p.inverseMass + q.inverseMass;
        if (invMassSum > 0) {
            const correctionMagnitude = Math.max(manifold.penetration - slop, 0) / invMassSum;
            const correction = Vector.multiply(normal, correctionMagnitude);
            p.position = Vector.subtract(p.position, Vector.multiply(correction, p.inverseMass));
            q.position = Vector.add(q.position, Vector.multiply(correction, q.inverseMass));
        }

        p.isColliding = true;
        q.isColliding = true;
    }

    function checkCollision(p, q, deltaTime) {
        const manifold = findCollisionDataSAT(p, q);
        if (!manifold) return;
        resolveCollisionWithManifold(p, q, manifold, deltaTime);
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
        const walls = [
            { normal: Vector.create(1, 0), toWall: Vector.create(-1, 0), centerToWall: particle.position.x },
            { normal: Vector.create(-1, 0), toWall: Vector.create(1, 0), centerToWall: canvasWidth - particle.position.x },
            { normal: Vector.create(0, 1), toWall: Vector.create(0, -1), centerToWall: particle.position.y },
            { normal: Vector.create(0, -1), toWall: Vector.create(0, 1), centerToWall: canvasHeight - particle.position.y }
        ];

        const velocityThreshold = 0.1;
        const slop = 0.01;

        walls.forEach((wall) => {
            const supportDistance = getDistanceToCentroid(particle, wall.toWall);
            const penetration = supportDistance - wall.centerToWall;

            if (penetration <= 0) return;

            const contactOffsets = getWallContactOffsets(particle, wall.toWall);
            const contactCount = Math.max(1, contactOffsets.length);

            contactOffsets.forEach((r) => {
                const vContact = Vector.add(particle.velocity, Vector.cross2D(particle.rotationalVelocity, r));
                const vN = Vector.dot(vContact, wall.normal);

                if (vN < -velocityThreshold) {
                    const rCrossN = Vector.cross2DScalar(r, wall.normal);
                    const effectiveMass = particle.inverseMass + (rCrossN * rCrossN) * particle.inverseMomentOfInertia;

                    if (effectiveMass > 0) {
                        const j = (-(1 + restitution) * vN / effectiveMass) / contactCount;
                        const impulse = Vector.multiply(wall.normal, j);

                        particle.velocity = Vector.add(particle.velocity, Vector.multiply(impulse, particle.inverseMass));
                        particle.rotationalVelocity += (rCrossN * j) * particle.inverseMomentOfInertia;
                    }
                }
            });

            const correction = Math.max(penetration - slop, 0);
            particle.position = Vector.add(particle.position, Vector.multiply(wall.normal, correction));
        });
    }

    function getParticleAtPosition(position, maxDistance = 30) {
        // Returns the first particle found within maxDistance of position
        for (let p of particles) {
            const dist = Vector.distance(p.position, position);
            if (dist <= p.radius + maxDistance) {
                return p;
            }
        }
        return null;
    }

    function setParticleDragTarget(particle, targetPosition) {
        // Set a drag target; particle will be pulled toward it via spring force
        particle.dragTarget = targetPosition;
    }

    function clearParticleDragTarget(particle) {
        // Clear the drag target to stop pulling the particle
        particle.dragTarget = null;
    }

    // Collision handling removed (resetting collision system)
    
    return {
        addParticle,
        setBoundarySize,
        update,
        getParticles,
        applyConstraints,
        getParticleCount,
        clearParticles,
        getParticleAtPosition,
        setParticleDragTarget,
        clearParticleDragTarget
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
    let dragState = null;
    
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
            const fillColor = p.isColliding ? '#ff0000' : '#ffffff';
            
            if (p.shape === 'square') {
                // Draw square with rotation
                ctx.save();
                ctx.translate(p.position.x, p.position.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = fillColor;
                ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
                ctx.restore();
            } else {
                // Draw circle
                ctx.fillStyle = fillColor;
                ctx.beginPath();
                ctx.arc(p.position.x, p.position.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
            }
            
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

        // Draw drag line if a particle is being dragged
        if (dragState) {
            const draggedParticle = dragState.getDraggedParticle();
            const mousePos = dragState.getCurrentMousePos();
            
            if (draggedParticle && mousePos) {
                ctx.strokeStyle = '#0099ff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(draggedParticle.position.x, draggedParticle.position.y);
                ctx.lineTo(mousePos.x, mousePos.y);
                ctx.stroke();
            }
        }
    }

    function setupInteraction(onCanvasClick, onParticleDrag) {
        let draggedParticle = null;
        let lastMousePos = null;
        let currentMousePos = null;
        let wasJustDragged = false;

        function getMousePos(event) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (event.clientX - rect.left) * scaleX;
            const y = (event.clientY - rect.top) * scaleY;
            return Vector.create(x, y);
        }

        canvas.addEventListener('mousedown', (event) => {
            const mousePos = getMousePos(event);
            draggedParticle = PhysicsCore.getParticleAtPosition(mousePos);
            lastMousePos = mousePos;
            currentMousePos = mousePos;

            if (draggedParticle) {
                // Start dragging: set target for spring force to pull toward
                PhysicsCore.setParticleDragTarget(draggedParticle, mousePos);
            }
        });

        canvas.addEventListener('mousemove', (event) => {
            const mousePos = getMousePos(event);
            currentMousePos = mousePos;

            if (!draggedParticle) return;

            // Update drag target to follow mouse
            PhysicsCore.setParticleDragTarget(draggedParticle, mousePos);
            lastMousePos = mousePos;
        });

        canvas.addEventListener('mouseup', (event) => {
            if (!draggedParticle) return;
            
            // Release drag target; particle continues with its current velocity
            PhysicsCore.clearParticleDragTarget(draggedParticle);
            
            draggedParticle = null;
            lastMousePos = null;
            currentMousePos = null;
            wasJustDragged = true;
        });

        canvas.addEventListener('mouseleave', (event) => {
            if (!draggedParticle) return;
            // Release drag target if mouse leaves canvas
            PhysicsCore.clearParticleDragTarget(draggedParticle);
            draggedParticle = null;
            lastMousePos = null;
            currentMousePos = null;
            wasJustDragged = true;
        });

        // Handle click to spawn new particles (if not on existing particle)
        canvas.addEventListener('click', (event) => {
            // Don't spawn if we just finished dragging
            if (wasJustDragged) {
                wasJustDragged = false;
                return;
            }
            
            const mousePos = getMousePos(event);
            const existingParticle = PhysicsCore.getParticleAtPosition(mousePos);
            if (!existingParticle) {
                // Only spawn new particle if not clicking on existing one
                onCanvasClick(mousePos);
            }
        });

        // Return dragged particle info for rendering
        return {
            getDraggedParticle: () => draggedParticle,
            getCurrentMousePos: () => currentMousePos
        };
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
        setupInteraction,
        getCanvasDim,
        setDragState: (state) => { dragState = state; }
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
    const shapeSelect = document.getElementById('shapeSelect');
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
    
    // Function to set canvas size and update physics boundaries
    function resizeCanvas() {
        const wrapper = canvas.parentElement;
        canvas.width = wrapper.clientWidth;
        canvas.height = wrapper.clientHeight;
        PhysicsCore.setBoundarySize(Renderer.getCanvasDim());
    }
    
    // Set initial canvas size
    resizeCanvas();
    
    // Update canvas size on window resize
    window.addEventListener('resize', resizeCanvas);
    
    // Set boundary size for physics calculations
    PhysicsCore.setBoundarySize(Renderer.getCanvasDim());
    
    // Add three large particles in a tower at the center of the screen
    function addDefaultParticles() {
        const canvasDim = Renderer.getCanvasDim();
        const centerX = canvasDim.width / 2;
        const centerY = canvasDim.height / 2;
        const radius = 50;
        const particleDiameter = radius * 2;
        
        // Stack particles vertically, centered horizontally
        const particles = [
            { y: centerY - particleDiameter, mass: 100, shape: 'circle' },
            { y: centerY, mass: 200, shape: 'square' },
            { y: centerY + particleDiameter, mass: 500, shape: 'circle' }
        ];
        
        particles.forEach(p => {
            PhysicsCore.addParticle(Vector.create(centerX, p.y), Vector.create(0, 0), p.mass, radius, p.shape);
        });
    }
    
    addDefaultParticles();
    particleCounter.textContent = PhysicsCore.getParticleCount()
    
    const dragState = Renderer.setupInteraction((position) => {
        const mass = parseFloat(massInput.value) || 1;
        const radius = parseFloat(radiusInput.value) || 8;
        const velocityX = parseFloat(velocityXInput.value) || 0;
        const velocityY = parseFloat(velocityYInput.value) || 0;
        const shape = shapeSelect.value || 'circle';
        
        PhysicsCore.addParticle(position, Vector.create(velocityX, velocityY), mass, radius, shape);
        particleCounter.textContent = PhysicsCore.getParticleCount()
    });
    
    Renderer.setDragState(dragState);

    

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
