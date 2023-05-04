import * as THREE from 'three'
import Ammo from '/static/ammo'

import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DracoLoader'

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import {Controls} from './controls.js'
import {Detector} from "./Detector.js";
import Stats from "three/examples/jsm/libs/stats.module.js";

export default class Canvas {
    constructor () {
        this.clock = new THREE.Clock()


        this.rigidBodies = []
        this.meshes = []
        this.meshMap = new WeakMap()

        this.createRenderer()
        this.createScene()
        this.createCamera()
        this.createLights()
        this.startAmmo()




        this.actions = {};
        this.keysActions = {
            "KeyW":'acceleration',
            "KeyS":'braking',
            "KeyA":'left',
            "KeyD":'right'
        };

        this.controlsCar = new Controls();

        this.speedometer = document.getElementById('speedometer');
        this.container = document.getElementById('container');


        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.update()
        this.container.innerHTML = "";
        this.stats = new Stats();


        this.stats.domElement.style.top = '0px';

        this.container.appendChild(this.stats.domElement);

        this.update()

        document.addEventListener('keyup', this.keyup.bind(this), false);
        document.addEventListener('keydown', this.keydown.bind(this), false);
        window.addEventListener('resize', this.onResize.bind(this), false)
    }

    createRenderer () {
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true
        })
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.setPixelRatio(window.devicePixelRatio || 1)
        this.renderer.autoClear = true
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.renderer.toneMappingExposure = 1
        this.renderer.setClearColor(0x000015)
        this.renderer.shadowMap.enabled = true

        document.body.appendChild(this.renderer.domElement)
    }

    createCamera () {
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.camera.position.z = 30
        this.camera.position.y = 10

    }

    createScene() {
        this.scene = new THREE.Scene()

    }

    createLights() {
        let ambLight = new THREE.AmbientLight(0xffffff, 0.5)
        this.scene.add(ambLight)

        let dirLight = new THREE.DirectionalLight( 0xffffff , 1)
        dirLight.color.setHSL( 0.1, 1, 0.95 )
        dirLight.position.set( -3, 2.5, 1 )
        dirLight.position.multiplyScalar( 100 )
        this.scene.add( dirLight )

        dirLight.castShadow = true

        dirLight.shadow.mapSize.width = 2048
        dirLight.shadow.mapSize.height = 2048

        let d = 50

        dirLight.shadow.camera.left = -d
        dirLight.shadow.camera.right = d
        dirLight.shadow.camera.top = d
        dirLight.shadow.camera.bottom = -d

        dirLight.shadow.camera.far = 20000


        const textureEquirec = new THREE.TextureLoader().load('/static/assets/models/sky.jpg')
        textureEquirec.mapping = THREE.EquirectangularReflectionMapping
        textureEquirec.encoding = THREE.sRGBEncoding
        this.scene.environment = textureEquirec
        this.scene.background = textureEquirec
    }

    startAmmo(){
        Ammo().then( (Ammo) => {
            if (!Detector.webgl) {
                Detector.addGetWebGLMessage();
            }
            Ammo = Ammo
            this.ammoClone = Ammo
            this.createAmmo(Ammo)
        })
    }

    createAmmo(Ammo = this.ammoClone){
        this.tempTransform = new Ammo.btTransform()

        this.setupPhysicsWorld(Ammo)
        this.createPlane(Ammo)
        this.createCar(Ammo)
    }

    setupPhysicsWorld(Ammo = this.ammoClone){
        let collisionConfiguration = new Ammo.btDefaultCollisionConfiguration()
        let dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration)
        let overlappingPairCache = new Ammo.btDbvtBroadphase()
        let solver = new Ammo.btSequentialImpulseConstraintSolver()

        this.physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, overlappingPairCache, solver, collisionConfiguration)
        this.physicsWorld.setGravity(new Ammo.btVector3(0, -10, 0))
        console.log('physics world init')
    }

    createPlane(Ammo = this.ammoClone){
        let pos = {x: 0, y: 0, z: 0},
            scale = {x: 50, y: 1, z: 50},
            quat = {x: 0, y: 0, z: 0, w: 1},
            mass = 0

        //plane in threejs
        let shape = new THREE.BoxGeometry(scale.x, scale.y, scale.z)
        let material = new THREE.MeshPhongMaterial({color: 0x999999,})
        let blockPlane = new THREE.Mesh(shape, material)
        blockPlane.position.copy(pos);
        blockPlane.quaternion.copy(quat);

        blockPlane.castShadow = true
        blockPlane.receiveShadow = true

        this.scene.add(blockPlane)

        let friction = 2.5;

        //physics in ammojs
        let transform = new Ammo.btTransform()
        transform.setIdentity()
        transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z))
        transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w))

        let motionState = new Ammo.btDefaultMotionState(transform)

        let localInertia = new Ammo.btVector3(0, 0, 0)

        let geometry = new Ammo.btBoxShape(new Ammo.btVector3(scale.x * 0.5, scale.y * 0.5, scale.z * 0.5))
        geometry.setMargin(0.05)
        geometry.calculateLocalInertia(mass, localInertia)

        let rigidBodyInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, geometry, localInertia)
        let rBody = new Ammo.btRigidBody(rigidBodyInfo)
        rBody.setFriction(friction)


        this.physicsWorld.addRigidBody(rBody)

        this.vehicleSteering = 0;

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

    createCar(Ammo = this.ammoClone){
        let pos = {x: 0, y: 4, z: 1},
            quat = {x: 0, y: 0, z: 0, w: 1},
            mass = 1


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

    updateCarModel (deltaTime, vehicle) {

        let speed = vehicle.getCurrentSpeedKmHour();
        this.speedometer.innerHTML = (speed < 0 ? '(R) ' : '') + Math.abs(speed).toFixed(1) + ' km/h';


        let steeringIncrement = .04;
        let steeringClamp = .5;


        let maxEngineForce = 2000;
        let maxBreakingForce = 100;
        let breakingForce = 0;
        let engineForce = 0;

        if (this.actions.acceleration) {
            engineForce = maxEngineForce;
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
        vehicle.applyEngineForce(engineForce, this.FRONT_LEFT);
        vehicle.applyEngineForce(engineForce, this.FRONT_RIGHT);
        if (breakingForce === 0) {
            vehicle.setBrake(0, this.FRONT_LEFT);
            vehicle.setBrake(0, this.FRONT_RIGHT);
            vehicle.setBrake(0, this.BACK_LEFT);
            vehicle.setBrake(0, this.BACK_RIGHT);
        } else {
            vehicle.setBrake(breakingForce / 2, this.FRONT_LEFT);
            vehicle.setBrake(breakingForce / 2, this.FRONT_RIGHT);
            vehicle.setBrake(breakingForce, this.BACK_LEFT);
            vehicle.setBrake(breakingForce, this.BACK_RIGHT);
        }

        console.log('engineForce', engineForce);
        console.log('breakingForce', breakingForce);

        vehicle.setSteeringValue(this.vehicleSteering, this.FRONT_LEFT);
        vehicle.setSteeringValue(this.vehicleSteering, this.FRONT_RIGHT);

        let tm, p, q, i;
        let n = vehicle.getNumWheels();
        for (i = 0; i < n; i++) {
            vehicle.updateWheelTransform(i, true);
            tm = vehicle.getWheelTransformWS(i);
            p = tm.getOrigin();
            q = tm.getRotation();
            this.wheelMeshes[i].position.set(p.x(), p.y(), p.z());
            this.wheelMeshes[i].quaternion.set(q.x(), q.y(), q.z(), q.w());
        }

        tm = vehicle.getChassisWorldTransform();
        p = tm.getOrigin();
        q = tm.getRotation();
        this.chassisMesh.position.set(p.x(), p.y(), p.z());
        this.chassisMesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
    }

    /**
     * Events
     */

    onResize() {
        const windowWidth = window.innerWidth
        const windowHeight = window.innerHeight

        this.camera.aspect = windowWidth/windowHeight
        this.camera.updateProjectionMatrix()

        this.renderer.setSize(windowWidth, windowHeight)
    }

    /**
     * Loop
     */

    updatePhysics(delta){
        this.physicsWorld.stepSimulation(delta, 10)

    }

    update(){
        this.delta = this.clock.getDelta()
        if(this.physicsWorld){
            this.updatePhysics(this.delta * 2)
            this.updateCarModel(this.delta, this.vehicle)
        }
        this.stats.update()
        this.renderer.render(this.scene, this.camera)
        requestAnimationFrame(this.update.bind(this))
    }

}
