// Simple GLTF/GLB loader for WebGL
class GLTFLoader {
  static async loadGLB(url) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return this.parseGLB(buffer);
  }

  static parseGLB(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    // Read GLB header
    const magic = view.getUint32(offset, true);
    offset += 4;
    if (magic !== 0x46546C67) { // 'glTF'
      throw new Error('Invalid GLB file');
    }

    const version = view.getUint32(offset, true);
    offset += 4;
    const length = view.getUint32(offset, true);
    offset += 4;

    // Read JSON chunk
    const jsonChunkLength = view.getUint32(offset, true);
    offset += 4;
    const jsonChunkType = view.getUint32(offset, true);
    offset += 4;

    const jsonBytes = new Uint8Array(buffer, offset, jsonChunkLength);
    const jsonText = new TextDecoder().decode(jsonBytes);
    const gltf = JSON.parse(jsonText);
    offset += jsonChunkLength;

    // Read binary chunk
    const binChunkLength = view.getUint32(offset, true);
    offset += 4;
    const binChunkType = view.getUint32(offset, true);
    offset += 4;

    const binData = new ArrayBuffer(binChunkLength);
    new Uint8Array(binData).set(new Uint8Array(buffer, offset, binChunkLength));

    return this.extractMeshData(gltf, binData);
  }

  static extractMeshData(gltf, binData) {
    const vertices = [];
    const normals = [];
    const indices = [];

    // Get the first mesh
    const mesh = gltf.meshes[0];
    const primitive = mesh.primitives[0];

    // Extract position data
    const posAccessor = gltf.accessors[primitive.attributes.POSITION];
    const posBufferView = gltf.bufferViews[posAccessor.bufferView];
    const posData = new Float32Array(
      binData,
      posBufferView.byteOffset,
      posAccessor.count * 3
    );

    // Extract normal data
    let normData = null;
    if (primitive.attributes.NORMAL !== undefined) {
      const normAccessor = gltf.accessors[primitive.attributes.NORMAL];
      const normBufferView = gltf.bufferViews[normAccessor.bufferView];
      normData = new Float32Array(
        binData,
        normBufferView.byteOffset,
        normAccessor.count * 3
      );
    }

    // Extract indices
    let indexData = null;
    if (primitive.indices !== undefined) {
      const indexAccessor = gltf.accessors[primitive.indices];
      const indexBufferView = gltf.bufferViews[indexAccessor.bufferView];
      
      if (indexAccessor.componentType === 5123) { // UNSIGNED_SHORT
        indexData = new Uint16Array(
          binData,
          indexBufferView.byteOffset,
          indexAccessor.count
        );
      } else if (indexAccessor.componentType === 5125) { // UNSIGNED_INT
        indexData = new Uint32Array(
          binData,
          indexBufferView.byteOffset,
          indexAccessor.count
        );
      }
    }

    // If no indices, create them
    if (!indexData) {
      indexData = new Uint16Array(posData.length / 3);
      for (let i = 0; i < indexData.length; i++) {
        indexData[i] = i;
      }
    }

    // If no normals, calculate them
    if (!normData) {
      normData = this.calculateNormals(posData, indexData);
    }

    return {
      vertices: posData,
      normals: normData,
      indices: indexData,
      bounds: this.calculateBounds(posData)
    };
  }

  static calculateNormals(vertices, indices) {
    const normals = new Float32Array(vertices.length);
    
    // Calculate face normals and accumulate
    for (let i = 0; i < indices.length; i += 3) {
      const i1 = indices[i] * 3;
      const i2 = indices[i + 1] * 3;
      const i3 = indices[i + 2] * 3;

      const v1 = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
      const v2 = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];
      const v3 = [vertices[i3], vertices[i3 + 1], vertices[i3 + 2]];

      // Calculate face normal
      const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
      const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
      
      const normal = [
        edge1[1] * edge2[2] - edge1[2] * edge2[1],
        edge1[2] * edge2[0] - edge1[0] * edge2[2],
        edge1[0] * edge2[1] - edge1[1] * edge2[0]
      ];

      // Add to vertex normals
      for (let j = 0; j < 3; j++) {
        const idx = indices[i + j] * 3;
        normals[idx] += normal[0];
        normals[idx + 1] += normal[1];
        normals[idx + 2] += normal[2];
      }
    }

    // Normalize all vertex normals
    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.sqrt(
        normals[i] * normals[i] +
        normals[i + 1] * normals[i + 1] +
        normals[i + 2] * normals[i + 2]
      );
      if (len > 0) {
        normals[i] /= len;
        normals[i + 1] /= len;
        normals[i + 2] /= len;
      }
    }

    return normals;
  }

  static calculateBounds(vertices) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i]);
      maxX = Math.max(maxX, vertices[i]);
      minY = Math.min(minY, vertices[i + 1]);
      maxY = Math.max(maxY, vertices[i + 1]);
      minZ = Math.min(minZ, vertices[i + 2]);
      maxZ = Math.max(maxZ, vertices[i + 2]);
    }

    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
      size: [maxX - minX, maxY - minY, maxZ - minZ]
    };
  }
}

export default GLTFLoader;