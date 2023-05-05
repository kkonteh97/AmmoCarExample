import * as THREE from 'three'
import {Controls} from './controls.js'

import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DracoLoader'

export class Car {
    constructor (Ammo, scene, physicsWorld) {
        this.ammoClone = Ammo
        this.scene = scene
        this.rigidBodies = []
        this.meshes = []
        this.physicsWorld = physicsWorld

        this.actions = {};
        this.keysActions = {
            "KeyW":'acceleration',
            "KeyS":'braking',
            "KeyA":'left',
            "KeyD":'right'
        };

        this.controlsCar = new Controls();
        this.speedometer = document.getElementById('speedometer');
        document.addEventListener('keyup', this.keyup.bind(this), false);
        document.addEventListener('keydown', this.keydown.bind(this), false);
    }

    addWheel(isFront, pos, radius, width, index, vehicle, Ammo = this.ammoClone) {
        let friction = 1000;
        let suspensionStiffness = 20.0;
        let suspensionDamping = 2.3;
        let suspensionCompression = 4.4;
        let suspensionRestLength = 0.6;
        let rollInfluence = 0.2;
        let wheelDirectionCS0 = new Ammo.btVector3(0, -1, 0);
        let wheelAxleCS = new Ammo.btVector3(-1, 0, 0);


        let wheelInfo = vehicle.addWheel(
            pos,
            wheelDirectionCS0,
            wheelAxleCS,
            suspensionRestLength,
            radius,
            this.tuning,
            isFront);

        wheelInfo.set_m_suspensionStiffness(suspensionStiffness);
        wheelInfo.set_m_wheelsDampingRelaxation(suspensionDamping);
        wheelInfo.set_m_wheelsDampingCompression(suspensionCompression);
        wheelInfo.set_m_frictionSlip(friction);
        wheelInfo.set_m_rollInfluence(rollInfluence);

        let t = new THREE.CylinderGeometry(radius, radius, width, 24, 1);
        t.rotateZ(Math.PI / 2);
        let mesh = new THREE.Mesh(t, new THREE.MeshPhongMaterial({ color: 'blue' }));
        mesh.add(new THREE.Mesh(new THREE.BoxGeometry(width * 1.5, radius * 1.75, radius*.25, 1, 1, 1), new THREE.MeshPhongMaterial({ color: 'red' })));
        this.scene.add(mesh);
        this.wheelMeshes[index] = mesh;
    }
    createGLTF(Ammo = this.ammoClone){
        let pos = {x: 0, y: 4, z: 1},
            quat = {x: 0, y: 0, z: 0, w: 1},
            mass = 1

        this.loader = new GLTFLoader()
        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath('/static/draco/')
        this.loader.setDRACOLoader(dracoLoader)
        this.loader.load('/static/assets/models/suz.glb', (gltf) => {
            const geometry = gltf.scene.children[0].geometry
            const material = gltf.scene.children[0].material
            this.createInstances(geometry, material, Ammo)


        })

    }
    createCar(Ammo = this.ammoClone){
        let pos = {x: 0, y: 0, z: 0},
            quat = {x: 0, y: 0, z: 0, w: 1}


        let chassisWidth = 1.8;
        let chassisHeight = .6;
        let chassisLength = 4;
        let massVehicle = 800;



        let geometry = new Ammo.btBoxShape(new Ammo.btVector3(chassisWidth * .5, chassisHeight * .5, chassisLength * .5));

        let transform = new Ammo.btTransform()
        transform.setIdentity()
        transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z))
        transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w))

        let motionState = new Ammo.btDefaultMotionState(transform)
        let localInertia = new Ammo.btVector3(0, 0, 0)
        geometry.calculateLocalInertia(massVehicle, localInertia)
        let rigidBodyInfo = new Ammo.btRigidBodyConstructionInfo(massVehicle, motionState, geometry, localInertia)
        let Body = new Ammo.btRigidBody(rigidBodyInfo)
        Body.setActivationState(4)

        this.physicsWorld.addRigidBody(Body)


        const shape = new THREE.BoxGeometry(chassisWidth, chassisHeight, chassisLength)
        const material = new  THREE.MeshStandardMaterial({color: 0xffffff, metalness: 1, roughness: 0.3})
        this.chassisMesh = new THREE.Mesh(shape, material)

        let that = this;

        this.loader = new GLTFLoader()
        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath('../static/draco/')
        this.loader.load('../static/models/car2.glb', function (gltf) {
            var car = gltf.scene;
            car.scale.set(0.015, 0.015, 0.015);
            car.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            that.scene.add(car) //add car to scene

            that.chassisMesh = car
        });
        this.chassisMesh.castShadow = true
        this.chassisMesh.receiveShadow = true
        this.scene.add(this.chassisMesh)

        //physics in ammojs
        this.chassisMesh.userData.physicsBody = Body
        this.rigidBodies.push(this.chassisMesh)

        // Raycast Vehicle
        this.tuning = new Ammo.btVehicleTuning();
        let rayCaster = new Ammo.btDefaultVehicleRaycaster(this.physicsWorld);
        this.vehicle = new Ammo.btRaycastVehicle(this.tuning, Body, rayCaster);
        this.vehicle.setCoordinateSystem(0, 1, 2);
        this.physicsWorld.addAction(this.vehicle);


        // Wheels
        this.wheelMeshes = [];

        this.FRONT_LEFT = 0;
        this.FRONT_RIGHT = 1;
        this.BACK_LEFT = 2;
        this.BACK_RIGHT = 3;

        let wheelAxisFrontPosition = 1.3;
        let wheelHalfTrackFront = 1.1;
        let wheelAxisHeightFront = .3;
        let wheelRadiusFront = .35;
        let wheelWidthFront = .2;


        let wheelAxisPositionBack = -1.3;
        let wheelRadiusBack = .4;
        let wheelWidthBack = .3;
        let wheelHalfTrackBack = 1.1;
        let wheelAxisHeightBack = .3;

        this.addWheel(true, new Ammo.btVector3(wheelHalfTrackFront, wheelAxisHeightFront, wheelAxisFrontPosition), wheelRadiusFront, wheelWidthFront, this.FRONT_LEFT, this.vehicle);
        this.addWheel(true, new Ammo.btVector3(-wheelHalfTrackFront, wheelAxisHeightFront, wheelAxisFrontPosition), wheelRadiusFront, wheelWidthFront, this.FRONT_RIGHT, this.vehicle);
        this.addWheel(false, new Ammo.btVector3(-wheelHalfTrackBack, wheelAxisHeightBack, wheelAxisPositionBack), wheelRadiusBack, wheelWidthFront, this.BACK_LEFT, this.vehicle);
        this.addWheel(false, new Ammo.btVector3(wheelHalfTrackBack, wheelAxisHeightBack, wheelAxisPositionBack), wheelRadiusBack, wheelWidthFront, this.BACK_RIGHT, this.vehicle);


    }
    keyup(e) {
        if(this.keysActions[e.code]) {
            this.actions[this.keysActions[e.code]] = false;
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }
    keydown(e) {
        if(this.keysActions[e.code]) {
            this.actions[this.keysActions[e.code]] = true;
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    updateCarModel () {
        let speed = this.vehicle.getCurrentSpeedKmHour();
        this.speedometer.innerHTML = (speed < 0 ? '(R) ' : '') + Math.abs(speed).toFixed(1) + ' km/h';

        let steeringIncrement = .04;
        let steeringClamp = .5;

        let maxEngineForce = 2000;
        let maxBreakingForce = 100;
        let breakingForce = 0;
        let engineForce = 0;

        if (this.actions.acceleration) {
            if (speed < -1)
                breakingForce = maxBreakingForce;
            else engineForce = maxEngineForce;
        }
        if (this.actions.braking) {
            breakingForce = maxBreakingForce;
        }
        if (this.actions.left) {
            if (this.vehicleSteering < steeringClamp)
                this.vehicleSteering += steeringIncrement;
        } else {
            if (this.actions.right) {
                if (this.vehicleSteering > -steeringClamp)
                    this.vehicleSteering -= steeringIncrement;
            } else {
                if (this.vehicleSteering < -steeringIncrement)
                    this.vehicleSteering += steeringIncrement;
                else {
                    if (this.vehicleSteering > steeringIncrement)
                        this.vehicleSteering -= steeringIncrement;
                    else {
                        this.vehicleSteering = 0;
                    }
                }
            }
        }


        this.vehicle.applyEngineForce(engineForce, this.FRONT_LEFT);
        this.vehicle.applyEngineForce(engineForce, this.FRONT_RIGHT);

        this.vehicle.setBrake(breakingForce / 2, this.FRONT_LEFT);
        this.vehicle.setBrake(breakingForce / 2, this.FRONT_RIGHT);
        this.vehicle.setBrake(breakingForce, this.BACK_LEFT);
        this.vehicle.setBrake(breakingForce, this.BACK_RIGHT);

        this.vehicle.setSteeringValue(this.vehicleSteering, this.FRONT_LEFT);
        this.vehicle.setSteeringValue(this.vehicleSteering, this.FRONT_RIGHT);

        let tm,
            p,
            q,
            i;
        let n = this.vehicle.getNumWheels();
        for (i = 0; i < n; i++) {
            this.vehicle.updateWheelTransform(i, true);
            tm = this.vehicle.getWheelTransformWS(i);
            p = tm.getOrigin();
            q = tm.getRotation();
            this.wheelMeshes[i].position.set(p.x()-10, p.y(), p.z());
            this.wheelMeshes[i].quaternion.set(q.x(), q.y(), q.z(), q.w());
        }

        tm = this.vehicle.getChassisWorldTransform();
        p = tm.getOrigin();
        q = tm.getRotation();
        this.chassisMesh.position.set(p.x()-10, p.y(), p.z());
        this.chassisMesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
    }

}
