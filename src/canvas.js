import * as THREE from 'three'
import Ammo from '/static/ammo'

import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DracoLoader'

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import {Controls} from './controls.js'
import {Detector} from "./Detector.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import {Car} from "./Car.js";

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

        this.container = document.getElementById('container');


        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.update()
        this.container.innerHTML = "";
        this.stats = new Stats();


        this.stats.domElement.style.top = '0px';

        this.container.appendChild(this.stats.domElement);

        this.update()

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
        this.car = new Car(Ammo, this.scene, this.physicsWorld);
        this.car.createCar()
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
            this.car.updateCarModel(this.delta, this.vehicle)
        }
        this.stats.update()
        this.renderer.render(this.scene, this.camera)
        requestAnimationFrame(this.update.bind(this))
    }

}
